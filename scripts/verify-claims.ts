// Recomputes every number in the README's summary table and fails if any row differs.
// Usage: pnpm verify
import { readFileSync } from "node:fs";
import { sound } from "@/engine";
import { decidingRow } from "@/engine/decision";
import { allInFrom } from "@/engine/cost";
import type { BookCapture } from "@/engine/types";
import { readBps } from "@/analyst/normalize";
import { recordedCapture, universe } from "@/lib/data";
import { census } from "@/lib/research";
import { deletionTest } from "@/lib/deletion";
import { LEAD_CEILING_WORDS, LEAD_FEE_WORDS } from "@/lib/lead";

async function recompute(): Promise<Record<string, string>> {
  const u = await universe("recorded");
  const cap = recordedCapture("RHIMSUSDT") as BookCapture;
  const fee = readBps(LEAD_FEE_WORDS)!, ceiling = readBps(LEAD_CEILING_WORDS)!;
  const lead = sound({ capture: cap, intent: { side: "sell", baseQty: "178.4121" }, ceilingBps: ceiling, userFeeBps: fee, now: new Date(Number(cap.exchange_ts)), historical: true, stockInfo: u.stockInfo, states: u.states, calendar: u.calendar, instruments: u.instruments });
  const mid = Number(lead.referenceMid), bid = Number(cap.raw.data.bids[0][0]);
  const clip = lead.alternatives!.find((a) => a.kind === "largest_within_ceiling")!;
  const c = census(), cell = (b: number, ce: number) => c.cells.find((x) => x.budget === b && x.ceiling === ce)!;
  const del = await deletionTest(), row = (id: string) => del.rows.find((r) => r.id === id)!.without;
  const para = JSON.parse(readFileSync("evidence/paraphrase-eval-v2-heldout/results.json", "utf8")).summary;
  const whole = JSON.parse(readFileSync("evidence/wholetask-eval-v2-heldout/results.json", "utf8")).summary;
  const hub = readFileSync("evidence/agenthub-20261008/bgc-dry-run.jsonl", "utf8").trim().split("\n").filter((l) => JSON.parse(l).data?.wouldSend).length;
  const ours = readFileSync("evidence/agenthub-20261008/sounding-prepare.txt", "utf8").trim().split("\n").filter((l) => l.includes('"status":"prepared"')).length;
  return {
    "lead.best-bid": `${allInFrom(((mid - bid) / mid) * 10000, fee, "sell").toFixed(2)} bps`,
    "lead.full-size": `${decidingRow(lead)!.allInBps} bps, ${decidingRow(lead)!.verdict === "WITHIN_CEILING_ON_THIS_SNAPSHOT" ? "within" : "over"} ${ceiling}`,
    "lead.fits": `${clip.qty} sh`,
    "census.5k-50": `${cell(5000, 50).topYesSizeNo} / ${cell(5000, 50).priced}`,
    "census.25k-50": `${cell(25000, 50).topYesSizeNo} / ${cell(25000, 50).priced}`,
    "census.fee-decides": `${cell(25000, 50).feeFlip} / ${cell(25000, 50).priced}`,
    "census.median-5k": `${c.lead.median} bps`,
    "deletion.book": row("book").code!,
    "deletion.stock-info": row("stockInfo").code!,
    "deletion.session": row("session").code!,
    "deletion.instruments": row("instruments").code!,
    "deletion.qwen": row("qwen").headline,
    "eval.whole-task": `${whole.model.complete}/${whole.model.tasks} (${whole.model.critical} critical) vs ${whole.template.complete}/${whole.template.tasks} (${whole.template.critical} critical)`,
    "eval.reading": `${para.qwen.all.statedCorrect}/${para.qwen.all.statedFields} vs ${para.regex.all.statedCorrect}/${para.regex.all.statedFields}`,
    "agenthub.dry-run-previews": `${hub} of 3`,
    "agenthub.sounding-prepared": `${ours} of 3`,
  };
}

async function main() {
  const readme = readFileSync("README.md", "utf8");
  const block = readme.slice(readme.indexOf("<!-- SUMMARY:BEGIN -->"), readme.indexOf("<!-- SUMMARY:END -->"));
  const claimed = Object.fromEntries([...block.matchAll(/^\| `([a-z0-9.-]+)` \| ([^|]+?) \|/gm)].map((m) => [m[1], m[2].trim()]));
  const actual = await recompute();
  let bad = 0;
  for (const [id, value] of Object.entries(actual)) {
    const ok = claimed[id] === value;
    if (!ok) bad++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${id.padEnd(30)} ${ok ? value : `README says ${claimed[id] ?? "(missing)"}, recomputed ${value}`}`);
  }
  for (const id of Object.keys(claimed)) if (!(id in actual)) { bad++; console.log(`FAIL  ${id.padEnd(30)} in README, not recomputed`); }
  console.log(`\n${Object.keys(actual).length - bad}/${Object.keys(actual).length} claims verified`);
  process.exit(bad ? 1 : 0);
}
main();
