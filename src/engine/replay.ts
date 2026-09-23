/** Offline replay: `pnpm replay fixtures/rhims-20260920T090235Z.json sell 178.412132 50` — no network. */
import { readFileSync } from "node:fs";
import { sound } from "./index";
import type { BookCapture, Intent } from "./types";

const [file, side, amount, ceiling] = process.argv.slice(2);
if (!file || !side || !amount) { console.error("usage: replay <capture.json> <buy|sell> <quoteBudget|baseQty> [ceilingBps=50]"); process.exit(2); }
const capture = JSON.parse(readFileSync(file, "utf8")) as BookCapture;
const intent: Intent = side === "buy" ? { side: "buy", quoteBudget: amount } : { side: "sell", baseQty: amount };
const ctx = {
  stockInfo: JSON.parse(readFileSync("fixtures/stock-info-20260920.json", "utf8")).data,
  states: JSON.parse(readFileSync("fixtures/market-states-20260920.json", "utf8")).states,
  calendar: JSON.parse(readFileSync("fixtures/calendar-20260920.json", "utf8")),
  instruments: JSON.parse(readFileSync("fixtures/instruments-20260923.json", "utf8")).rows,
};
const r = sound({ capture, intent, ceilingBps: Number(ceiling ?? 50), now: new Date(Number(capture.exchange_ts)), historical: true, ...ctx });
console.log(JSON.stringify({ ok: r.ok, gate: r.gate, gateDetail: r.gateDetail, suggestion: r.suggestion, session: r.session, mid: r.referenceMid, leg: r.leg, fees: r.fees, feeSensitive: r.feeSensitive, alternatives: r.alternatives, receipt_sha256: r.receipt.receipt_sha256 }, null, 1));
