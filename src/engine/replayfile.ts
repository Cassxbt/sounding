import { sound } from "./index";
import { canonicalJson, sha256 } from "./book";
import type { Calendar, MarketStates } from "./session";
import type { BookCapture, InstrumentSpec, Receipt } from "./types";
import type { StockInfo } from "./eligibility";
import { DEFAULT_FEE_SCENARIOS_BPS, ENGINE_VERSION } from "./index";

/** What the desk's "Download receipt" saves: enough to recompute the decision, and its hash, with no network. */
export interface ReplayBundle {
  receipt: Receipt;
  capture: BookCapture;
  sessionInputs: { states: MarketStates | null; calendar: Calendar | null };
  previousBpsPreFee?: string;
}

/** Re-run the engine on exactly what the receipt says it used, and compare hashes. */
export function replayBundle(b: ReplayBundle) {
  const r = b.receipt;
  // A receipt is recomputed by the engine that made it; another version prices differently by design.
  if (r.engineVersion !== ENGINE_VERSION) return { matches: false, expected: r.receipt_sha256, recomputed: undefined, result: undefined, reason: `made by ${r.engineVersion}; this is ${ENGINE_VERSION}` };
  // The file itself must still hash to its own receipt hash, or its shown outputs are not the ones issued.
  if (sha256(canonicalJson({ ...r, receipt_sha256: undefined, receipt_sig: undefined })) !== r.receipt_sha256) return { matches: false, expected: r.receipt_sha256, recomputed: undefined, result: undefined, reason: "the receipt file was edited after it was issued" };
  const meta = r.metadata as { stockInfo: StockInfo | null; instrument: InstrumentSpec | null };
  const userFeeBps = r.feeScenariosBps.length > DEFAULT_FEE_SCENARIOS_BPS.length ? r.feeScenariosBps.at(-1) : undefined;
  const result = sound({
    capture: b.capture, intent: r.intent, ceilingBps: r.ceilingBps, userFeeBps, now: new Date(r.evaluated_at_utc), historical: r.historical,
    stockInfo: meta.stockInfo ? [meta.stockInfo] : [], instruments: meta.instrument ? [meta.instrument] : [],
    states: b.sessionInputs.states, calendar: b.sessionInputs.calendar, previousBpsPreFee: b.previousBpsPreFee,
  });
  return { matches: result.receipt.receipt_sha256 === r.receipt_sha256, expected: r.receipt_sha256, recomputed: result.receipt.receipt_sha256, result };
}
