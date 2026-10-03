import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split("\n")) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim(); }

/**
 * Paraphrase eval: did each stated limit reach the engine with the right value?
 * Prompts and gold values were written by a separate agent that never saw this code.
 * Usage: pnpm exec tsx scripts/paraphrase-eval.ts <prompts.json> <outDir>
 */

type Field = "takerFeeBps" | "ceilingBps" | "hardDeadlineNy" | "mustBeFlat" | "sizeShares" | "sizeQuoteUsdt";
const FIELDS: Field[] = ["takerFeeBps", "ceilingBps", "hardDeadlineNy", "mustBeFlat", "sizeShares", "sizeQuoteUsdt"];
type Value = string | number | boolean | null;
interface Case { id: string; lang: string; text: string; gold: Record<Field, Value>; adversarial: boolean; note?: string }
/** correct: right value reached the engine. wrong: a different value reached it (the dangerous outcome). missed: stated, nothing reached it. invented: not stated, a value reached it. held: a conflict was asked back instead of used. */
type Outcome = "correct" | "wrong" | "missed" | "invented" | "held";

const norm = (f: Field, v: Value): Value => {
  if (f === "mustBeFlat") return v === true;
  if (v === null || v === undefined) return null;
  if (f === "takerFeeBps" || f === "ceilingBps") return Number(v);
  if (f === "sizeShares" || f === "sizeQuoteUsdt") return String(Number(v));
  return String(v);
};

function score(f: Field, gold: Value, got: Value, held: boolean): Outcome {
  const g = norm(f, gold), r = norm(f, got);
  if (held && g !== null && r === null) return "held";
  if (g === r) return "correct";
  if (g === null || g === false) return "invented";
  if (r === null || r === false) return "missed";
  return "wrong";
}

async function main() {
  const [promptsPath, outDir] = process.argv.slice(2);
  const { intake, regexIntake } = await import("../src/analyst/intake");
  const { EMPTY_CONSTRAINTS } = await import("../src/analyst");
  const set = JSON.parse(readFileSync(promptsPath, "utf8")) as { today_ny: string; cases: Case[] };
  const rows: { id: string; lang: string; adversarial: boolean; text: string; arm: string; got: Record<Field, Value>; outcome: Record<Field, Outcome>; clarification: string | null; ms: number }[] = [];

  for (const c of set.cases) {
    for (const arm of ["regex", "qwen"] as const) {
      const t0 = Date.now();
      const r = arm === "regex" ? regexIntake(c.text, EMPTY_CONSTRAINTS) : await intake(c.text, EMPTY_CONSTRAINTS, set.today_ny, "model");
      if (arm === "qwen" && r.reader !== "qwen") throw new Error(`${c.id}: Qwen arm fell back to ${r.reader}; refusing to score a fallback as Qwen`);
      const got: Record<Field, Value> = { takerFeeBps: r.constraints.takerFeeBps, ceilingBps: r.ceilingBps ?? null, hardDeadlineNy: r.constraints.hardDeadlineNy, mustBeFlat: r.constraints.mustBeFlat, sizeShares: r.sizeShares ?? null, sizeQuoteUsdt: r.sizeQuoteUsdt ?? null };
      const heldNames = new Set(r.fields.filter((f) => f.status === "conflict").map((f) => f.name as string));
      const outcome = Object.fromEntries(FIELDS.map((f) => [f, score(f, c.gold[f], got[f], heldNames.has(f))])) as Record<Field, Outcome>;
      rows.push({ id: c.id, lang: c.lang, adversarial: c.adversarial, text: c.text, arm, got, outcome, clarification: r.clarification, ms: Date.now() - t0 });
    }
    process.stdout.write(".");
  }

  const tally = (arm: string, pred: (r: (typeof rows)[number]) => boolean = () => true) => {
    const t: Record<Outcome, number> = { correct: 0, wrong: 0, missed: 0, invented: 0, held: 0 };
    let stated = 0, statedCorrect = 0, casesAllRight = 0, n = 0;
    for (const r of rows.filter((x) => x.arm === arm && pred(x))) {
      n++;
      const c = set.cases.find((x) => x.id === r.id)!;
      let all = true;
      for (const f of FIELDS) {
        t[r.outcome[f]]++;
        if (norm(f, c.gold[f]) !== null && norm(f, c.gold[f]) !== false) { stated++; if (r.outcome[f] === "correct") statedCorrect++; }
        if (r.outcome[f] !== "correct") all = false;
      }
      if (all) casesAllRight++;
    }
    return { cases: n, casesAllRight, statedFields: stated, statedCorrect, ...t };
  };
  const summary = {
    today_ny: set.today_ny, cases: set.cases.length, fields: FIELDS,
    note: "The regex arm has no ceiling reader: before checked intake the ceiling came only from the form.",
    regex: { all: tally("regex"), adversarial: tally("regex", (r) => r.adversarial), zh: tally("regex", (r) => r.lang !== "en") },
    qwen: { all: tally("qwen"), adversarial: tally("qwen", (r) => r.adversarial), zh: tally("qwen", (r) => r.lang !== "en") },
  };
  mkdirSync(outDir, { recursive: true });
  writeFileSync(`${outDir}/results.json`, JSON.stringify({ summary, rows }, null, 1));

  const cell = (r: (typeof rows)[number], f: Field) => (r.outcome[f] === "correct" ? "✓" : `${r.outcome[f]}${r.got[f] === null ? "" : ` (${r.got[f]})`}`);
  const lines = [
    `# Paraphrase eval · ${set.cases.length} prompts · today ${set.today_ny} NY`, "",
    "Prompts and gold values were written by a separate agent that never saw the code. Each stated limit is scored on whether the right value reached the engine.", "",
    "| arm | stated limits that reached the engine correctly | cases fully right | wrong value used | missed | invented | held (asked back) |", "|---|---|---|---|---|---|---|",
    ...(["regex", "qwen"] as const).map((a) => { const t = summary[a].all; return `| ${a === "qwen" ? "Qwen checked intake" : "regex baseline"} | ${t.statedCorrect}/${t.statedFields} | ${t.casesAllRight}/${t.cases} | ${t.wrong} | ${t.missed} | ${t.invented} | ${t.held} |`; }),
    "", summary.note, "",
    "| id | lang | adv | text | arm | " + FIELDS.join(" | ") + " |", "|" + "---|".repeat(5 + FIELDS.length),
    ...rows.map((r) => `| ${r.id} | ${r.lang} | ${r.adversarial ? "y" : ""} | ${r.arm === "regex" ? r.text.replace(/\|/g, "/") : ""} | ${r.arm} | ${FIELDS.map((f) => cell(r, f)).join(" | ")} |`),
  ];
  writeFileSync(`${outDir}/RESULTS.md`, lines.join("\n") + "\n");
  console.log("\n" + JSON.stringify({ regex: summary.regex.all, qwen: summary.qwen.all }, null, 1));
}
main();
