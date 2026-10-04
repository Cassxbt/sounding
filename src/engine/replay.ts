/**
 * Offline replay, no network.
 *   pnpm replay fixtures/rhims-20260920T090235Z.json sell 178.4121 50 8
 *   pnpm replay --receipt sounding-RHIMSUSDT-<ts>.json     (a receipt downloaded from the desk, recorded or live)
 */
import { readFileSync } from "node:fs";
import { sound } from "./index";
import { replayBundle } from "./replayfile";
import type { BookCapture, Intent } from "./types";

if (process.argv[2] === "--receipt") {
  const out = replayBundle(JSON.parse(readFileSync(process.argv[3], "utf8")));
  console.log(JSON.stringify({ matches: out.matches, expected: out.expected, recomputed: out.recomputed }, null, 1));
  process.exit(out.matches ? 0 : 1);
}

const [file, side, amount, ceiling, fee] = process.argv.slice(2);
if (!file || !side || !amount) { console.error("usage: replay <capture.json> <buy|sell> <quoteBudget|baseQty> [ceilingBps=50] [yourTakerFeeBps]"); process.exit(2); }
const capture = JSON.parse(readFileSync(file, "utf8")) as BookCapture;
const intent: Intent = side === "buy" ? { side: "buy", quoteBudget: amount } : { side: "sell", baseQty: amount };
const ctx = {
  stockInfo: JSON.parse(readFileSync("fixtures/stock-info-20260920.json", "utf8")).data,
  states: JSON.parse(readFileSync("fixtures/market-states-20260920.json", "utf8")).states,
  calendar: JSON.parse(readFileSync("fixtures/calendar-20260920.json", "utf8")),
  instruments: JSON.parse(readFileSync("fixtures/instruments-20260923.json", "utf8")).rows,
};
const r = sound({ capture, intent, ceilingBps: Number(ceiling ?? 50), userFeeBps: fee === undefined ? undefined : Number(fee), now: new Date(Number(capture.exchange_ts)), historical: true, ...ctx });
console.log(JSON.stringify({ ok: r.ok, gate: r.gate, gateDetail: r.gateDetail, suggestion: r.suggestion, session: r.session, mid: r.referenceMid, leg: r.leg, fees: r.fees, feeSensitive: r.feeSensitive, alternatives: r.alternatives, receipt_sha256: r.receipt.receipt_sha256 }, null, 1));
