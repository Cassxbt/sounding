import { canonicalJson, receiptSignatureValid, sha256, signReceiptHash } from "./book";
import { DEFAULT_LASTLOOK_TOLERANCE_BPS, MAX_DECISION_AGE_MS, decidingRow } from "./decision";
import type { FeeScenario, Receipt, SoundingResult } from "./types";
import { D } from "./types";
import type Decimal from "decimal.js";

/**
 * Last Look: the decision a trader confirms is re-checked on a fresh book before it stands.
 * The anomaly is any material change between the sounding the trader read and the book at the moment they confirm.
 */

export { DEFAULT_LASTLOOK_TOLERANCE_BPS, MAX_DECISION_AGE_MS, decidingRow };

export type LastLookStatus = "STANDS_ON_FRESH_BOOK" | "VOID_GATE" | "VOID_STALE";

export interface LastLookResult {
  status: LastLookStatus;
  reasons: string[];
  toleranceBps: number;
  decidingFeeBps: number;
  /** fresh exact pre-fee cost minus original, bps vs each book's mid; positive = worse execution */
  driftBps?: string;
  /** VWAP the trader would get, fresh vs original, bps; positive = better for the trader (higher for a sell, lower for a buy) */
  priceDriftBps?: string;
  /** room left under the ceiling at the deciding fee when the decision was read, bps */
  headroomBps?: string;
  /** seconds between the book the trader read and the book confirmed on */
  gapSeconds: string;
  original: { receipt_sha256: string; exchange_ts: string; allInBps?: string; verdict: FeeScenario["verdict"] };
  fresh_receipt_sha256?: string;
  fresh: SoundingResult;
  receipt_sha256: string;
  receipt_sig?: string;
}

export class LastLookInputError extends Error {}

/** Content hash matches (integrity) and, on a signing deployment, the server's signature matches (authenticity). */
export function verifyReceipt(r: Receipt): boolean {
  if (!r?.receipt_sha256 || sha256(canonicalJson({ ...r, receipt_sha256: undefined, receipt_sig: undefined })) !== r.receipt_sha256) return false;
  return receiptSignatureValid(r.receipt_sha256, r.receipt_sig);
}

const sameOrder = (a: SoundingResult, b: SoundingResult) =>
  a.symbol === b.symbol && a.ceilingBps === b.ceilingBps && canonicalJson(a.intent) === canonicalJson(b.intent);

/** Rebuild the parts of a sounding that Last Look relies on from its hash-verified receipt, never from client-editable fields. */
function fromReceipt(s: SoundingResult): SoundingResult {
  const r = s.receipt; const o = (r.outputs ?? {}) as Partial<Pick<SoundingResult, "leg" | "fees">>;
  return { ...s, ok: !r.gate, symbol: r.symbol, intent: r.intent, ceilingBps: r.ceilingBps, leg: o.leg, fees: o.fees };
}

export function lastLook(sent: SoundingResult, fresh: SoundingResult, toleranceBps = DEFAULT_LASTLOOK_TOLERANCE_BPS): LastLookResult {
  if (!verifyReceipt(sent.receipt)) throw new LastLookInputError("original receipt hash does not verify; nothing to confirm");
  const original = fromReceipt(sent);
  const o = decidingRow(original);
  if (!original.ok || !o || o.verdict !== "WITHIN_CEILING_ON_THIS_SNAPSHOT")
    throw new LastLookInputError("only a decision that was within the ceiling under the deciding fee can be confirmed");
  if (!sameOrder(original, fresh)) throw new LastLookInputError("fresh sounding is for a different order");
  const gapMs = Number(fresh.receipt.exchange_ts) - Number(original.receipt.exchange_ts);
  if (!(gapMs >= 0)) throw new LastLookInputError("the confirming book is older than the decision");

  const reasons: string[] = [];
  let status: LastLookStatus = "STANDS_ON_FRESH_BOOK";
  const headroomBps = o.allInBps !== undefined ? (original.ceilingBps - Number(o.allInBps)).toFixed(2) : undefined;
  const tooOld = gapMs > MAX_DECISION_AGE_MS;
  let driftBps: string | undefined, priceDriftBps: string | undefined;
  const f = fresh.fees?.find((x) => x.source === o.source && x.feeBps === o.feeBps);

  if (!fresh.ok) {
    status = "VOID_GATE";
    reasons.push(`${fresh.gate}: ${fresh.gateDetail}`);
  } else if (fresh.leg?.status !== "OK" || !f) {
    status = "VOID_STALE";
    reasons.push("visible depth no longer covers the full order");
  } else {
    // Compared exactly; shown with enough digits that a breach never reads as "10.00 beyond 10".
    const drift = D(fresh.leg.bpsPreFeeExact!).minus(original.leg!.bpsPreFeeExact!);
    driftBps = shown(drift, toleranceBps);
    if (f.verdict !== "WITHIN_CEILING_ON_THIS_SNAPSHOT") {
      status = "VOID_STALE";
      reasons.push(`verdict flipped: ${f.allInBps} bps all-in now exceeds the ${fresh.ceilingBps} bps ceiling`);
    }
    if (drift.abs().gt(toleranceBps)) {
      status = "VOID_STALE";
      reasons.push(`execution cost moved ${drift.gt(0) ? "against you" : "in your favour"} by ${shown(drift.abs(), toleranceBps)} bps, beyond the ${toleranceBps} bps tolerance; re-read before acting`);
    }
    // The cost is relative to each book's mid; the price itself can move while relative cost stays put.
    const sign = fresh.intent.side === "sell" ? 1 : -1;
    const pd = D(fresh.leg.vwap!).minus(original.leg!.vwap!).div(original.leg!.vwap!).mul(10000).mul(sign);
    priceDriftBps = shown(pd, toleranceBps);
    if (pd.abs().gt(toleranceBps)) {
      status = "VOID_STALE";
      reasons.push(`the price you would get moved ${pd.lt(0) ? "against you" : "in your favour"} by ${shown(pd.abs(), toleranceBps)} bps since you read it, beyond the ${toleranceBps} bps tolerance${pd.gt(0) ? "; a different market from the one you decided on" : ""}`);
    }
    if (status === "STANDS_ON_FRESH_BOOK" && !tooOld) reasons.push(`fresh book within ${toleranceBps} bps of the sounding you read on cost and price; still within ceiling at ${f.allInBps} bps`);
  }

  // A gate failure outranks age in the badge; the age reason is listed either way.
  if (tooOld) {
    if (status === "STANDS_ON_FRESH_BOOK") status = "VOID_STALE";
    reasons.push(`the decision was read ${formatGap(gapMs)} before this confirm, beyond the ${MAX_DECISION_AGE_MS / 60_000}-minute limit; re-sound before acting`);
  }
  const core = {
    status, reasons, toleranceBps, decidingFeeBps: o.feeBps, driftBps, priceDriftBps, headroomBps, gapSeconds: (gapMs / 1000).toFixed(1),
    original: { receipt_sha256: original.receipt.receipt_sha256!, exchange_ts: original.receipt.exchange_ts, allInBps: o.allInBps, verdict: o.verdict },
    fresh_receipt_sha256: fresh.receipt.receipt_sha256,
  };
  const receipt_sha256 = sha256(canonicalJson(core));
  return { ...core, fresh, receipt_sha256, receipt_sig: signReceiptHash(receipt_sha256) };
}

function shown(v: Decimal, tolerance: number): string {
  const two = v.toFixed(2);
  return v.abs().gt(tolerance) && D(two).abs().lte(tolerance) ? v.toFixed(4) : two;
}

function formatGap(ms: number): string {
  const m = ms / 60_000;
  return m < 120 ? `${m.toFixed(1)} minutes` : m < 2880 ? `${(m / 60).toFixed(1)} hours` : `${(m / 1440).toFixed(1)} days`;
}
