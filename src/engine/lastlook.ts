import { canonicalJson, sha256 } from "./book";
import type { FeeScenario, Receipt, SoundingResult } from "./types";
import { D } from "./types";

/**
 * Last Look: the decision a trader confirms is re-checked on a fresh book before it stands.
 * Night Desk (Bitget S1 1st) cancelled on anomaly; here the anomaly is any material change between
 * the sounding the trader read and the book at the moment they confirm.
 */

export const DEFAULT_LASTLOOK_TOLERANCE_BPS = 5;

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
  original: { receipt_sha256: string; exchange_ts: string; allInBps?: string; verdict: FeeScenario["verdict"] };
  fresh: SoundingResult;
  receipt_sha256: string;
}

export class LastLookInputError extends Error {}

export function verifyReceipt(r: Receipt): boolean {
  return !!r.receipt_sha256 && sha256(canonicalJson({ ...r, receipt_sha256: undefined })) === r.receipt_sha256;
}

/** The fee row that decides: the trader's stated fee, otherwise the worst scenario (a decision must hold at every unknown fee). */
export function decidingRow(r: SoundingResult): FeeScenario | undefined {
  const fees = r.fees ?? [];
  return fees.find((f) => f.source === "user") ?? fees.filter((f) => f.source === "scenario").sort((a, b) => b.feeBps - a.feeBps)[0];
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

  const reasons: string[] = [];
  let status: LastLookStatus = "STANDS_ON_FRESH_BOOK";
  let driftBps: string | undefined, priceDriftBps: string | undefined;
  const f = fresh.fees?.find((x) => x.source === o.source && x.feeBps === o.feeBps);

  if (!fresh.ok) {
    status = "VOID_GATE";
    reasons.push(`${fresh.gate}: ${fresh.gateDetail}`);
  } else if (fresh.leg?.status !== "OK" || !f) {
    status = "VOID_STALE";
    reasons.push("visible depth no longer covers the full order");
  } else {
    const drift = D(fresh.leg.bpsPreFeeExact!).minus(original.leg!.bpsPreFeeExact!);
    driftBps = drift.toFixed(2);
    if (f.verdict !== "WITHIN_CEILING_ON_THIS_SNAPSHOT") {
      status = "VOID_STALE";
      reasons.push(`verdict flipped: ${f.allInBps} bps all-in now exceeds the ${fresh.ceilingBps} bps ceiling`);
    }
    if (drift.abs().gt(toleranceBps)) {
      status = "VOID_STALE";
      reasons.push(`execution cost moved ${drift.gt(0) ? "against you" : "in your favour"} by ${drift.abs().toFixed(2)} bps, beyond the ${toleranceBps} bps tolerance; re-read before acting`);
    }
    // The cost is relative to each book's mid; the price itself can move while relative cost stays put.
    const sign = fresh.intent.side === "sell" ? 1 : -1;
    const pd = D(fresh.leg.vwap!).minus(original.leg!.vwap!).div(original.leg!.vwap!).mul(10000).mul(sign);
    priceDriftBps = pd.toFixed(2);
    if (pd.abs().gt(toleranceBps)) {
      status = "VOID_STALE";
      reasons.push(`the price you would get moved ${pd.lt(0) ? "against you" : "in your favour"} by ${pd.abs().toFixed(2)} bps since you read it, beyond the ${toleranceBps} bps tolerance`);
    }
    if (status === "STANDS_ON_FRESH_BOOK") reasons.push(`fresh book within ${toleranceBps} bps of the sounding you read on cost and price; still within ceiling at ${f.allInBps} bps`);
  }

  const core = {
    status, reasons, toleranceBps, decidingFeeBps: o.feeBps, driftBps, priceDriftBps,
    original: { receipt_sha256: original.receipt.receipt_sha256!, exchange_ts: original.receipt.exchange_ts, allInBps: o.allInBps, verdict: o.verdict },
    fresh_receipt_sha256: fresh.receipt.receipt_sha256,
  };
  return { ...core, fresh, receipt_sha256: sha256(canonicalJson(core)) } as LastLookResult;
}
