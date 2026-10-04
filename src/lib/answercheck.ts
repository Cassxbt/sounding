import { D } from "@/engine/types";
import type { SoundingResult } from "@/engine/types";
import { decidingRow, STABILITY_BPS } from "@/engine/decision";

export interface AnswerCheck { status: "stands" | "moved"; reasons: string[]; gapMs: number; driftBps?: string; priceDriftBps?: string }

/**
 * A model answer takes seconds; a live book does not wait. Before an actionable answer is returned, the same
 * order is sounded again on a fresh book; if the gate, the verdict, the cost or the price moved materially, the
 * route is withdrawn. Same thresholds as Last Look.
 */
export function answerTimeCheck(original: SoundingResult, fresh: SoundingResult): AnswerCheck {
  const gapMs = Number(fresh.receipt.exchange_ts) - Number(original.receipt.exchange_ts);
  const reasons: string[] = [];
  if (!fresh.ok) return { status: "moved", reasons: [`the fresh book failed a gate: ${fresh.gate}`], gapMs };
  const o = decidingRow(original), f = decidingRow(fresh);
  if (o?.verdict !== f?.verdict) reasons.push(`the verdict changed from ${o?.allInBps ?? "unpriced"} to ${f?.allInBps ?? "unpriced"} bps against your ${fresh.ceilingBps} bps ceiling`);
  let driftBps: string | undefined, priceDriftBps: string | undefined;
  if (original.leg?.status === "OK" && fresh.leg?.status === "OK") {
    const drift = D(fresh.leg.bpsPreFeeExact!).minus(original.leg.bpsPreFeeExact!);
    const sign = fresh.intent.side === "sell" ? 1 : -1;
    const pd = D(fresh.leg.vwap!).minus(original.leg.vwap!).div(original.leg.vwap!).mul(10000).mul(sign);
    driftBps = drift.toFixed(2); priceDriftBps = pd.toFixed(2);
    if (drift.abs().gt(STABILITY_BPS)) reasons.push(`the cost moved ${drift.toFixed(2)} bps while the answer was being written`);
    if (pd.abs().gt(STABILITY_BPS)) reasons.push(`the price you would get moved ${pd.toFixed(2)} bps while the answer was being written`);
  } else if (fresh.leg?.status !== original.leg?.status) reasons.push("visible depth changed: the full order is no longer covered");
  return { status: reasons.length ? "moved" : "stands", reasons, gapMs, driftBps, priceDriftBps };
}
