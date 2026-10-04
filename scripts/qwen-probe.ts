import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split("\n")) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim(); }
import { sound } from "../src/engine";
import { SYSTEM, buildUserPrompt, EMPTY_CONSTRAINTS } from "../src/analyst";
import { AnalystOutputSchema } from "../src/analyst/schema";
async function main() {
const fx = JSON.parse(readFileSync("fixtures/rhims-20260920T090235Z.json", "utf8"));
const ctx = { stockInfo: JSON.parse(readFileSync("fixtures/stock-info-20260920.json", "utf8")).data, states: JSON.parse(readFileSync("fixtures/market-states-20260920.json", "utf8")).states, calendar: JSON.parse(readFileSync("fixtures/calendar-20260920.json", "utf8")), instruments: JSON.parse(readFileSync("fixtures/instruments-20260923.json", "utf8")).rows };
const res = sound({ capture: fx, intent: { side: "sell", baseQty: "178.4121" }, ceilingBps: 50, now: new Date(Number(fx.exchange_ts)), historical: true, ...ctx });
const ev = JSON.parse(readFileSync("fixtures/evidence/RHIMSUSDT.json", "utf8"));
const user = buildUserPrompt(res, ev, EMPTY_CONSTRAINTS, [{ role: "user", text: "Sell 178.4121 rHIMS now. Ceiling 50 bps all-in. I hold this on the GLP-1 thesis; I must be flat before the CAO transition takes effect on October 9, so hard deadline October 8." }]);
const variant = process.argv[2] ?? "default";
const extra: Record<string, unknown> = variant === "nothink" ? { enable_thinking: false } : variant === "lowreason" ? { reasoning_effort: "low" } : {};
const { qwenAnalyze } = await import("../src/analyst/qwen");
if (variant === "lib") { const t1 = Date.now(); const out = await qwenAnalyze(SYSTEM, user, "probe"); console.log(`lib call ${((Date.now()-t1)/1000).toFixed(1)} s parsed=${!!out.parsed}`, JSON.stringify(out.usage)); if (out.parsed) { const { validate } = await import("../src/analyst/rules"); console.log("violations:", validate(out.parsed, res, ev)); console.log(JSON.stringify(out.parsed, null, 1).slice(0, 1800)); } else console.log("raw:", out.raw.slice(0, 500)); return; }
const body = { model: "qwen3.8-max", temperature: 0, response_format: { type: "json_object" }, ...extra,
  messages: [{ role: "system", content: SYSTEM }, { role: "user", content: user }] };
console.log("variant", variant, "| prompt chars", JSON.stringify(body).length);
const t0 = Date.now();
const r = await fetch("https://hackathon.bitgetops.com/v1/chat/completions", { method: "POST", signal: AbortSignal.timeout(300_000), headers: { "content-type": "application/json", authorization: `Bearer ${process.env.BITGET_QWEN_API_KEY}` }, body: JSON.stringify(body) });
const text = await r.text(); console.log("HTTP", r.status, `${((Date.now() - t0) / 1000).toFixed(1)} s`);
try { const j = JSON.parse(text); console.log("usage", JSON.stringify(j.usage)); const c = j.choices?.[0]?.message?.content ?? ""; console.log("content head:", c.slice(0, 600)); const p = AnalystOutputSchema.safeParse(JSON.parse(c.trim().replace(/^```(?:json)?\s*|\s*```$/g, ""))); console.log("schema parse:", p.success ? "OK" : p.error.issues.slice(0, 3)); } catch { console.log(text.slice(0, 500)); }
}
main();
