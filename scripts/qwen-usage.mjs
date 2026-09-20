// Summarise data/qwen-usage.jsonl: calls, tokens, latency, failures.
import { readFileSync, existsSync } from "node:fs";
const f = "data/qwen-usage.jsonl";
if (!existsSync(f)) { console.log("no usage yet"); process.exit(0); }
const rows = readFileSync(f, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
const ok = rows.filter((r) => r.status === 200);
const sum = (k) => ok.reduce((a, r) => a + (r.usage?.[k] ?? 0), 0);
console.log(`calls ${rows.length} (ok ${ok.length}, failed ${rows.length - ok.length}) · prompt ${sum("prompt_tokens")} · completion ${sum("completion_tokens")} · total ${sum("total_tokens")} tokens · avg ${Math.round(ok.reduce((a, r) => a + r.ms, 0) / Math.max(ok.length, 1))} ms`);
for (const r of rows.slice(-5)) console.log(` ${r.at} ${r.purpose} ${r.status} ${r.usage?.total_tokens ?? "-"} tok ${r.ms} ms`);
