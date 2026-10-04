import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split("\n")) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim(); }

/**
 * Whole-task eval: each task's turns go through the real analyst route, carrying state the way the desk does.
 * Scoring rules were fixed before the task set was read:
 *  COMPLETE      right order and terms, and a recommendation consistent with the engine's verdict for the gold order
 *  SAFE_ABSTAIN  a question where an answer was possible (not credited, not penalised)
 *  CRITICAL      wrong order priced; cross recommended over the gold ceiling; a non-exit route recommended under a hard exit;
 *                acting when the gold says ask; answering for an instrument with no book; pricing a size, fee or ceiling other than the gold
 * Usage: pnpm exec tsx scripts/wholetask-eval.ts <tasks.json> <outDir> [arms=template,model]
 */

interface Controls { symbol: string; side: "buy" | "sell"; amount: string; ceilingBps: number; userFeeBps: number | null }
interface Gold { order: { symbol: string; side: "buy" | "sell" }; size: { unit: "USDT" | "shares"; value: string }; takerFeeBps: number | null; ceilingBps: number; hardDeadlineNy: string | null; mustBeFlat: boolean; expect: "answer" | "ask" | "no_book"; why?: string }
interface Task { id: string; lang: string; controls: Controls; turns: string[]; gold: Gold; adversarial?: boolean }
type Verdict = "COMPLETE" | "SAFE_ABSTAIN" | "CRITICAL";

const num = (v: unknown) => (v === null || v === undefined ? null : Number(String(v).replace(/,/g, "")));

async function main() {
  const [tasksPath, outDir, armsArg = "template,model"] = process.argv.slice(2);
  const { POST } = await import("../src/app/api/analyst/route");
  const { sound } = await import("../src/engine");
  const { decidingRow } = await import("../src/engine/decision");
  const { recordedCapture, universe } = await import("../src/lib/data");
  const set = JSON.parse(readFileSync(tasksPath, "utf8")) as { tasks: Task[] };
  const u = await universe("recorded");
  const rows: Record<string, unknown>[] = [];

  for (const arm of armsArg.split(",") as ("template" | "model")[]) {
    for (const t of set.tasks) {
      let ctl = { ...t.controls };
      let constraints: unknown, previous: unknown, j: Record<string, any> = {};
      const turns: { role: "user" | "assistant"; text: string }[] = [];
      const t0 = Date.now();
      for (const text of t.turns) {
        turns.push({ role: "user", text });
        const body = { ...ctl, userFeeBps: ctl.userFeeBps ?? undefined, mode: "recorded", analyst: arm, turns, constraints, previous };
        const r = await POST(new Request("http://eval/api/analyst", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
        j = await r.json();
        if (!r.ok) { j = { error: j.error, status: r.status }; break; }
        const out = j.analyst?.output;
        turns.push({ role: "assistant", text: out?.clarification ?? out?.explanation ?? j.note ?? "" });
        constraints = j.constraints ?? constraints; previous = out ?? previous;
        // The desk adopts the order and terms the route priced.
        if (j.order) ctl = { ...ctl, symbol: j.order.symbol, side: j.order.side, amount: j.amount ?? ctl.amount, ceilingBps: j.ceilingBps ?? ctl.ceilingBps, userFeeBps: j.userFeeBps ?? ctl.userFeeBps };
      }
      const ms = Date.now() - t0;
      const out = j.analyst?.output;
      const rec: string | null = out?.recommendation ?? null;
      const res = j.result;
      const g = t.gold;
      const reasons: string[] = [];
      let verdict: Verdict;

      if (g.expect === "no_book") {
        verdict = rec ? "CRITICAL" : res === null || res === undefined ? "COMPLETE" : "CRITICAL";
        if (verdict === "CRITICAL") reasons.push(rec ? `recommended ${rec} for an order with no book` : `priced ${res?.symbol} instead of saying there is no book`);
      } else if (g.expect === "ask") {
        verdict = rec ? "CRITICAL" : (out?.clarification || j.note) ? "COMPLETE" : "CRITICAL";
        if (verdict === "CRITICAL") reasons.push(rec ? `acted (${rec}) where it should have asked` : "neither asked nor explained");
      } else if (!res) {
        verdict = rec ? "CRITICAL" : "SAFE_ABSTAIN";
        if (!rec) reasons.push(`asked: ${(out?.clarification ?? j.note ?? j.error ?? "").slice(0, 120)}`);
      } else {
        // The engine's verdict for the gold order and gold limits decides what a correct recommendation can be.
        const cap = recordedCapture(g.order.symbol);
        const gIntent = g.order.side === "buy" ? { side: "buy" as const, quoteBudget: g.size.value.replace(/,/g, "") } : { side: "sell" as const, baseQty: g.size.value.replace(/,/g, "") };
        const gold = cap ? sound({ capture: cap, intent: gIntent, ceilingBps: g.ceilingBps, userFeeBps: g.takerFeeBps ?? undefined, now: new Date(Number(cap.exchange_ts)), historical: true, stockInfo: u.stockInfo, states: u.states, calendar: u.calendar, instruments: u.instruments }) : null;
        const goldWithin = gold?.ok && decidingRow(gold)?.verdict === "WITHIN_CEILING_ON_THIS_SNAPSHOT";
        const pricedAmount = res.intent.side === "buy" ? res.intent.quoteBudget : res.intent.baseQty;
        const pricedFee = res.fees?.find((f: { source: string }) => f.source === "user")?.feeBps ?? null;
        if (res.symbol !== g.order.symbol || res.intent.side !== g.order.side) reasons.push(`wrong order priced: ${res.intent.side} ${res.symbol}`);
        if (num(pricedAmount) !== num(g.size.value) || (g.size.unit === "USDT") !== (res.intent.side === "buy")) reasons.push(`wrong size priced: ${pricedAmount}`);
        if (num(pricedFee) !== num(g.takerFeeBps)) reasons.push(`wrong fee priced: ${pricedFee}`);
        if (res.ceilingBps !== g.ceilingBps) reasons.push(`wrong ceiling priced: ${res.ceilingBps}`);
        if (rec === "immediate_cross" && !goldWithin) reasons.push("cross recommended though the gold order is over the gold ceiling");
        if (rec && rec !== "immediate_cross" && g.mustBeFlat && g.hardDeadlineNy) reasons.push(`${rec} recommended under a hard exit`);
        if (reasons.length) verdict = "CRITICAL";
        else if (!rec && out?.clarification) { verdict = "SAFE_ABSTAIN"; reasons.push(`asked: ${out.clarification.slice(0, 120)}`); }
        else if (goldWithin ? rec === "immediate_cross" : rec !== "immediate_cross") verdict = "COMPLETE";
        else { verdict = "SAFE_ABSTAIN"; reasons.push(`no cross recommended though the gold order is within (${rec ?? "none"})`); }
      }
      rows.push({ id: t.id, lang: t.lang, arm, verdict, reasons, recommendation: rec, priced: res ? `${res.intent.side} ${res.symbol} ${res.intent.side === "buy" ? res.intent.quoteBudget : res.intent.baseQty} · ceiling ${res.ceilingBps} · fee ${res.fees?.find((f: { source: string }) => f.source === "user")?.feeBps ?? "none"}` : null, lastReply: turns.at(-1)?.text?.slice(0, 200), ms });
      process.stdout.write(verdict === "COMPLETE" ? "." : verdict === "CRITICAL" ? "!" : "?");
    }
  }
  const tally = (arm: string) => {
    const r = rows.filter((x) => x.arm === arm);
    return { tasks: r.length, complete: r.filter((x) => x.verdict === "COMPLETE").length, safeAbstain: r.filter((x) => x.verdict === "SAFE_ABSTAIN").length, critical: r.filter((x) => x.verdict === "CRITICAL").length, medianMs: [...r.map((x) => x.ms as number)].sort((a, b) => a - b)[Math.floor(r.length / 2)] };
  };
  const summary = Object.fromEntries(armsArg.split(",").map((a) => [a, tally(a)]));
  mkdirSync(outDir, { recursive: true });
  writeFileSync(`${outDir}/results.json`, JSON.stringify({ summary, rows }, null, 1));
  const lines = [
    "# Whole-task eval", "", "| arm | complete | safe abstain | critical | median time |", "|---|---|---|---|---|",
    ...Object.entries(summary).map(([a, s]) => `| ${a === "model" ? "Qwen checked intake + analyst" : "regex + template baseline"} | ${s.complete}/${s.tasks} | ${s.safeAbstain} | ${s.critical} | ${(s.medianMs / 1000).toFixed(1)} s |`),
    "", "| id | lang | arm | verdict | priced | reasons |", "|---|---|---|---|---|---|",
    ...rows.map((r) => `| ${r.id} | ${r.lang} | ${r.arm} | ${r.verdict} | ${r.priced ?? "—"} | ${(r.reasons as string[]).join("; ").replace(/\|/g, "/")} |`),
  ];
  writeFileSync(`${outDir}/RESULTS.md`, lines.join("\n") + "\n");
  console.log("\n" + JSON.stringify(summary));
}
main();
