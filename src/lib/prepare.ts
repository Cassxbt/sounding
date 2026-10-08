import Decimal from "decimal.js";
import { buyShares, canonicalJson, canSign, receiptSignatureValid, sha256, signReceiptHash } from "@/engine/book";
import { allInBps, allInFrom } from "@/engine/cost";
import { decidingRow, MAX_DECISION_AGE_MS } from "@/engine/decision";
import { D, type Intent, type RawOrderbook, type SessionState, type SoundingResult } from "@/engine/types";
import { bgcCommand, orderFor, type AgentHubOrder } from "./agenthub";

export type FeeSource = "stated" | "bitget_account" | "scenario";

/** What the prepared order is bound to; its hash is signed, so the order, the book and the fee travel together. */
export interface Binding {
  engineVersion: string;
  receipt_sha256: string;
  exchange_ts: string;
  symbol: string;
  intent: Intent;
  ceilingBps: number;
  /** what the prepared order itself costs on this book, all-in */
  allInBps: string;
  /** all-in cost of a share filled at the limit price: no fill can cost more, and it is within the ceiling */
  worstCaseBps: string;
  /** the prepared order on this book: shares and USDT; for a buy, the part of the budget the order leaves unspent */
  expected: { qty: string; cash: string; unspentUsdt?: string };
  fee: { bps: number; source: FeeSource };
  order_sha256: string;
  prepared_at: string;
}

export type Preparation =
  | { status: "prepared"; order: AgentHubOrder; command: string; binding: Binding; binding_sha256: string; signature?: string; signed: boolean; book: "live" | "recorded" }
  | { status: "refused"; code: string; reason: string; proposal?: { size: string; unit: "sh" | "USDT"; remainder: string; note: string } };

const WITHIN = "WITHIN_CEILING_ON_THIS_SNAPSHOT";

/** The limit at which one share costs exactly the ceiling at this fee, rounded to the tick on the trader's side. */
export function ceilingPrice(mid: Decimal, ceilingBps: number, feeBps: number, side: "buy" | "sell", priceDp: number): Decimal {
  const f = D(feeBps).div(10000), pre = D(ceilingBps).minus(feeBps).div(side === "buy" ? f.plus(1) : D(1).minus(f)).div(10000);
  return side === "sell" ? mid.mul(D(1).minus(pre)).toDecimalPlaces(priceDp, Decimal.ROUND_UP) : mid.mul(pre.plus(1)).toDecimalPlaces(priceDp, Decimal.ROUND_DOWN);
}

const costAt = (mid: Decimal, price: Decimal, feeBps: number, side: "buy" | "sell") =>
  allInFrom((side === "sell" ? mid.minus(price) : price.minus(mid)).div(mid).mul(10000), feeBps, side);

/**
 * The step Agent Hub's own flow leaves open: between its dry run and the confirmation card nothing checks what the
 * size costs. An order comes back only when its whole size can fill on this book inside a limit at the trader's
 * ceiling price, at a known fee: then no share can cost more than the ceiling, whatever the book does before the send.
 * Anything else comes back as a reason, and the size that does fit is a new order the trader has to choose.
 */
export function prepare(res: SoundingResult, raw: RawOrderbook, feeSource: FeeSource, now: Date): Preparation {
  if (!res.ok) return { status: "refused", code: res.gate ?? "REFUSED", reason: `the engine refused this order: ${res.gateDetail ?? res.gate}` };
  if (res.feeSensitive) return { status: "refused", code: "FEE_DECIDES", reason: "your fee decides this order and it is not known: state it, or read it from your account with a read-only key" };
  const d = decidingRow(res)!, spec = res.spec!, side = res.intent.side, mid = D(res.referenceMid!);
  const qtyDp = Number(spec.quantityPrecision);
  // A ceiling so wide that its price is near zero: a sell's limit is raised to the lowest price whose order value
  // meets Bitget's minimum. Raising a sell's limit only tightens it, so the ceiling still holds.
  const priceDp = Number(spec.pricePrecision), tick = D(10).pow(-priceDp);
  const floor = side === "sell" ? Decimal.max(tick, D(spec.minOrderAmount).div(res.intent.baseQty).toDecimalPlaces(priceDp, Decimal.ROUND_UP)) : tick;
  const limit = Decimal.max(ceilingPrice(mid, res.ceilingBps, d.feeBps, side, priceDp), floor);
  const worst = costAt(mid, limit, d.feeBps, side);
  // Rounded on the trader's side, so this holds; checked exactly anyway rather than trusting the arithmetic above.
  if (worst.gt(res.ceilingBps)) return { status: "refused", code: "OVER_CEILING_ON_THIS_SNAPSHOT", reason: "no tick price keeps a share inside your ceiling at this fee" };
  const reachable = (side === "sell" ? raw.data.bids.filter(([p]) => D(p).gte(limit)) : raw.data.asks.filter(([p]) => D(p).lte(limit))).reduce((t, [, q]) => t.plus(q), D(0));
  const qty = side === "sell" ? D(res.intent.baseQty) : D(res.intent.quoteBudget).div(limit).toDecimalPlaces(qtyDp, Decimal.ROUND_DOWN);
  const fits = d.verdict === WITHIN && qty.gt(0) && reachable.gte(qty);

  if (!fits) {
    const unit = side === "sell" ? "sh" : "USDT";
    // A buy is offered what the asks inside the limit cost, so the offer re-prepares to the same shares.
    const spend = raw.data.asks.filter(([p]) => D(p).lte(limit)).reduce((t, [p, q]) => t.plus(D(p).mul(q)), D(0));
    const size = side === "sell" ? Decimal.min(reachable, qty).toDecimalPlaces(qtyDp, Decimal.ROUND_DOWN) : Decimal.min(spend, D(res.intent.quoteBudget)).toDecimalPlaces(2, Decimal.ROUND_DOWN);
    const shares = side === "sell" ? size : size.div(limit).toDecimalPlaces(qtyDp, Decimal.ROUND_DOWN);
    const asked = D(side === "sell" ? res.intent.baseQty : res.intent.quoteBudget);
    const offer = shares.gte(spec.minOrderQty) && shares.mul(limit).gte(spec.minOrderAmount) && size.lt(asked);
    const reason = d.verdict !== WITHIN
      ? d.allInBps ? `${d.allInBps} bps at ${d.source === "user" ? "your" : "the scenario"} ${d.feeBps} bps fee is over your ${res.ceilingBps} bps ceiling` : "the visible book cannot fill this order"
      : `${d.allInBps} bps on average here, but its deepest shares fill past ${limit.toFixed(Number(spec.pricePrecision))}, the price that keeps every share inside your ${res.ceilingBps} bps ceiling`;
    return {
      status: "refused", code: d.verdict !== WITHIN ? d.verdict : "PAST_CEILING_PRICE", reason,
      ...(offer ? { proposal: { size: size.toString(), unit, remainder: asked.minus(size).toString(), note: `fills now inside a limit at ${limit.toFixed(Number(spec.pricePrecision))}; nothing is prepared until you choose it` } } : {}),
    };
  }
  if (qty.lt(spec.minOrderQty) || qty.mul(limit).lt(spec.minOrderAmount))
    return { status: "refused", code: "BELOW_MIN_ORDER", reason: `at ${limit.toFixed(Number(spec.pricePrecision))} this is ${qty} sh, under Bitget's minimum order` };
  // What the order itself costs: a buy is sized in shares at the limit, so it is priced again at that size.
  const leg = side === "sell" ? res.leg! : buyShares(raw, qty.toString(), mid);
  const order = orderFor(res.symbol, side, limit.toFixed(Number(spec.pricePrecision)), qty.toString());
  const binding: Binding = {
    engineVersion: res.receipt.engineVersion, receipt_sha256: res.receipt.receipt_sha256!, exchange_ts: res.receipt.exchange_ts, symbol: res.symbol,
    intent: res.intent, ceilingBps: res.ceilingBps, allInBps: allInBps(leg, d.feeBps).toFixed(2), worstCaseBps: worst.toFixed(2),
    expected: { qty: qty.toString(), cash: D(leg.cashExact ?? leg.cash).toFixed(2), ...(side === "buy" ? { unspentUsdt: D(res.intent.quoteBudget).minus(leg.cashExact ?? leg.cash).toFixed(2) } : {}) },
    fee: { bps: d.feeBps, source: d.source === "user" ? feeSource : "scenario" },
    order_sha256: sha256(canonicalJson(order)), prepared_at: now.toISOString(),
  };
  const binding_sha256 = sha256(canonicalJson(binding));
  // A recorded book is for showing the mechanism: verify rejects it as stale, and it says so here too.
  return { status: "prepared", order, command: bgcCommand(order), binding, binding_sha256, signature: signReceiptHash(binding_sha256), signed: canSign(), book: res.freshness.historical ? "recorded" : "live" };
}

/** Before sending: the order must be the one checked, issued by this server, and recent enough to stand. */
export function verifyPrepared(order: AgentHubOrder, binding: Binding, signature: string | undefined, now: Date, session?: SessionState): { ok: true } | { ok: false; reason: string } {
  if (sha256(canonicalJson(order)) !== binding.order_sha256) return { ok: false, reason: "the order differs from the one Sounding checked" };
  // Without a key anyone could write a matching binding, so an unsigned server confirms nothing.
  if (!canSign()) return { ok: false, reason: "this server holds no signing key, so it cannot confirm it issued this order" };
  if (!receiptSignatureValid(sha256(canonicalJson(binding)), signature)) return { ok: false, reason: "this preparation was not issued by Sounding" };
  if (now.getTime() - Date.parse(binding.prepared_at) > MAX_DECISION_AGE_MS) return { ok: false, reason: "older than two minutes: sound the order again before sending" };
  if (session === "unknown") return { ok: false, reason: "the session could not be read, so nothing is confirmed" };
  if (session && session !== "weekend_mm" && session !== "holiday_mm") return { ok: false, reason: "the session has switched: Bitget now routes this order to the US market, where Sounding did not price it" };
  return { ok: true };
}
