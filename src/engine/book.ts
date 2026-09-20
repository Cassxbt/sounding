import Decimal from "decimal.js";
import { createHash } from "node:crypto";
import type { BookCapture, Level, LegCost, RawOrderbook } from "./types";
import { D } from "./types";

Decimal.set({ precision: 40 });

// Display thresholds for the thin-top flag; not validated market-safety thresholds.
export const THIN_TOP = { minFrac: D("0.25"), gapBps: D(3), penaltyBps: D(2) };

export function canonicalJson(v: unknown): string {
  return JSON.stringify(sortKeys(v));
}
function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") {
    return Object.keys(v as Record<string, unknown>)
      .sort()
      .reduce((o, k) => ((o[k] = sortKeys((v as Record<string, unknown>)[k])), o), {} as Record<string, unknown>);
  }
  return v;
}
export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** Python `json.dumps(sort_keys=True, separators=(",",":"))` equivalent, so hashes match the census. */
export function rawHash(raw: RawOrderbook): string {
  return sha256(canonicalJson(raw));
}

export type BookValidity =
  | { valid: true; bestBid: Decimal; bestAsk: Decimal; mid: Decimal }
  | { valid: false; code: "INVALID_BOOK" | "NO_EXECUTABLE_QUOTE"; detail: string };

export function validateBook(raw: RawOrderbook): BookValidity {
  const { asks, bids, ts } = raw.data ?? ({} as RawOrderbook["data"]);
  if (!asks || !bids) return { valid: false, code: "INVALID_BOOK", detail: "missing sides" };
  if (!ts || !/^\d{13}$/.test(ts)) return { valid: false, code: "INVALID_BOOK", detail: "missing exchange ts" };
  if (asks.length === 0 && bids.length === 0) return { valid: false, code: "NO_EXECUTABLE_QUOTE", detail: "empty book" };
  if (asks.length === 0 || bids.length === 0) return { valid: false, code: "INVALID_BOOK", detail: "one-sided book" };
  for (const [p, q] of [...asks, ...bids]) {
    if (!(D(p).gt(0)) || D(q).lt(0)) return { valid: false, code: "INVALID_BOOK", detail: `bad level ${p}/${q}` };
  }
  const bestAsk = D(asks[0][0]), bestBid = D(bids[0][0]);
  if (bestBid.gte(bestAsk)) return { valid: false, code: "INVALID_BOOK", detail: "crossed or locked" };
  return { valid: true, bestBid, bestAsk, mid: bestBid.plus(bestAsk).div(2) };
}

function walkForQty(levels: Level[], qty: Decimal): { cash: Decimal; unfilled: Decimal; used: number } {
  let rem = qty, cash = D(0), used = 0;
  for (const [p, q] of levels) {
    const take = Decimal.min(rem, D(q));
    cash = cash.plus(take.mul(p)); rem = rem.minus(take); used++;
    if (rem.eq(0)) break;
  }
  return { cash, unfilled: rem, used };
}

function walkForBudget(levels: Level[], budget: Decimal): { shares: Decimal; spent: Decimal; exhausted: boolean; used: number } {
  let rem = budget, shares = D(0), used = 0;
  for (const [p, q] of levels) {
    const lvl = D(p).mul(q); used++;
    if (lvl.gte(rem)) { shares = shares.plus(rem.div(p)); rem = D(0); break; }
    shares = shares.plus(q); rem = rem.minus(lvl);
  }
  return { shares, spent: budget.minus(rem), exhausted: rem.gt(0), used };
}

const notional = (levels: Level[]) => levels.reduce((s, [p, q]) => s.plus(D(p).mul(q)), D(0));

function thinTop(levels: Level[], reqQty: Decimal, best: Decimal, mid: Decimal, vwap: Decimal | undefined, side: "buy" | "sell"): boolean {
  if (!vwap || levels.length < 2) return false;
  const q0 = D(levels[0][1]);
  const gap = D(levels[1][0]).minus(best).abs().div(best).mul(10000);
  const bestBps = best.minus(mid).abs().div(mid).mul(10000);
  const vwapBps = side === "buy" ? vwap.minus(mid).div(mid).mul(10000) : mid.minus(vwap).div(mid).mul(10000);
  const penalty = vwapBps.minus(bestBps);
  return q0.lt(THIN_TOP.minFrac.mul(reqQty)) && gap.gte(THIN_TOP.gapBps) && penalty.gte(THIN_TOP.penaltyBps);
}

/** Buy with a quote budget: consume asks until the budget is spent. */
export function buyWithBudget(raw: RawOrderbook, quoteBudget: string, mid: Decimal): LegCost {
  const asks = raw.data.asks; const budget = D(quoteBudget);
  const { shares, spent, exhausted, used } = walkForBudget(asks, budget);
  const base = { levelsConsumed: used, visibleNotional: notional(asks).toFixed(2) };
  if (exhausted || shares.eq(0)) return { status: "INSUFFICIENT_VISIBLE_DEPTH", qty: shares.toFixed(6), cash: spent.toFixed(2), thinTop: false, ...base };
  const vwap = spent.div(shares);
  const bps = vwap.minus(mid).div(mid).mul(10000);
  return { status: "OK", qty: shares.toFixed(6), cash: spent.toFixed(2), vwap: vwap.toFixed(6), bpsPreFee: bps.toFixed(2), thinTop: thinTop(asks, budget.div(D(asks[0][0])), D(asks[0][0]), mid, vwap, "buy"), ...base };
}

/** Sell base shares: walk bids for the full quantity. */
export function sellShares(raw: RawOrderbook, baseQty: string, mid: Decimal): LegCost {
  const bids = raw.data.bids; const qty = D(baseQty);
  const { cash, unfilled, used } = walkForQty(bids, qty);
  const base = { levelsConsumed: used, visibleNotional: notional(bids).toFixed(2) };
  if (unfilled.gt(0)) return { status: "INSUFFICIENT_VISIBLE_DEPTH", qty: qty.toString(), cash: cash.toFixed(2), thinTop: false, ...base };
  const vwap = cash.div(qty);
  const bps = mid.minus(vwap).div(mid).mul(10000);
  return { status: "OK", qty: qty.toString(), cash: cash.toFixed(2), vwap: vwap.toFixed(6), bpsPreFee: bps.toFixed(2), thinTop: thinTop(bids, qty, D(bids[0][0]), mid, vwap, "sell"), ...base };
}

/** Largest sell quantity whose pre-fee+fee cost stays within the ceiling, by bisection over visible depth. */
export function largestSellWithin(raw: RawOrderbook, mid: Decimal, ceilingBps: number, feeBps: number): Decimal | null {
  const total = raw.data.bids.reduce((s, [, q]) => s.plus(q), D(0));
  if (total.eq(0)) return null;
  const within = (q: Decimal) => {
    const r = sellShares(raw, q.toString(), mid);
    return r.status === "OK" && D(r.bpsPreFee!).plus(feeBps).lte(ceilingBps);
  };
  if (!within(D(raw.data.bids[0][1]).div(100))) return null;
  let lo = D(0), hi = total;
  for (let i = 0; i < 60; i++) { const m = lo.plus(hi).div(2); if (within(m)) lo = m; else hi = m; }
  return lo.toDecimalPlaces(6, Decimal.ROUND_DOWN);
}

export function largestBuyWithin(raw: RawOrderbook, mid: Decimal, ceilingBps: number, feeBps: number): Decimal | null {
  const total = notional(raw.data.asks);
  if (total.eq(0)) return null;
  const within = (b: Decimal) => {
    const r = buyWithBudget(raw, b.toString(), mid);
    return r.status === "OK" && D(r.bpsPreFee!).plus(feeBps).lte(ceilingBps);
  };
  if (!within(D(1))) return null;
  let lo = D(0), hi = total;
  for (let i = 0; i < 60; i++) { const m = lo.plus(hi).div(2); if (within(m)) lo = m; else hi = m; }
  return lo.toDecimalPlaces(2, Decimal.ROUND_DOWN);
}

export function loadCapture(fx: BookCapture): BookCapture {
  const h = rawHash(fx.raw);
  if (h !== fx.raw_sha256) throw new Error(`fixture hash mismatch for ${fx.symbol}: ${h} != ${fx.raw_sha256}`);
  return fx;
}
