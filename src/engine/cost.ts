import { D, type LegCost } from "./types";
import type Decimal from "decimal.js";

/**
 * All-in cost against mid, in bps. Bitget charges the fee on the traded notional, which a buy pays above mid and a
 * sell receives below it, so the fee is not simply added: buy p + f + p·f/10⁴, sell p + f − p·f/10⁴.
 */
export function allInFrom(preBps: string | number | Decimal, feeBps: number, side: "buy" | "sell"): Decimal {
  const p = D(preBps), cross = p.mul(feeBps).div(10000);
  return side === "buy" ? p.plus(feeBps).plus(cross) : p.plus(feeBps).minus(cross);
}

export const allInBps = (leg: LegCost, feeBps: number): Decimal => allInFrom(leg.bpsPreFeeExact!, feeBps, leg.side);

/** The walking cost that lands exactly on the ceiling at this fee: the inverse of allInFrom. */
export function preFeeBudget(ceilingBps: number, feeBps: number, side: "buy" | "sell"): number {
  return (ceilingBps - feeBps) / (side === "buy" ? 1 + feeBps / 10000 : 1 - feeBps / 10000);
}
