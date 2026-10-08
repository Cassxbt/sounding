import { canonicalJson, canSign, receiptSignatureValid, sha256, signReceiptHash } from "@/engine/book";
import { allInFrom } from "@/engine/cost";
import { decidingRow, MAX_DECISION_AGE_MS } from "@/engine/decision";
import { D, type Intent, type SessionState, type SoundingResult } from "@/engine/types";
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
  allInBps: string;
  /** all-in cost if every share filled at the limit price: the most this order can cost against the checked mid */
  worstCaseBps: string;
  fee: { bps: number; source: FeeSource };
  order_sha256: string;
  prepared_at: string;
}

export type Preparation =
  | { status: "prepared"; order: AgentHubOrder; command: string; binding: Binding; binding_sha256: string; signature?: string; signed: boolean; book: "live" | "recorded" }
  | { status: "refused"; code: string; reason: string; proposal?: { size: string; unit: "sh" | "USDT"; remainder: string; note: string } };

const WITHIN = "WITHIN_CEILING_ON_THIS_SNAPSHOT";

/**
 * The step Agent Hub's own flow leaves open: between its dry run and the confirmation card nothing checks what the
 * size costs. An order comes back only when the engine finds it within the trader's ceiling at a known fee; anything
 * else comes back as a reason, and a smaller size is a new order the trader has to choose.
 */
export function prepare(res: SoundingResult, feeSource: FeeSource, now: Date): Preparation {
  if (!res.ok) return { status: "refused", code: res.gate ?? "REFUSED", reason: `the engine refused this order: ${res.gateDetail ?? res.gate}` };
  if (res.feeSensitive) return { status: "refused", code: "FEE_DECIDES", reason: "your fee decides this order and it is not known: state it, or read it from your account with a read-only key" };
  const d = decidingRow(res);
  if (!d || d.verdict !== WITHIN) {
    const clip = res.alternatives?.find((a) => a.kind === "largest_within_ceiling");
    const unit = res.intent.side === "sell" ? "sh" : "USDT";
    return {
      status: "refused",
      code: d?.verdict ?? "INSUFFICIENT_VISIBLE_DEPTH",
      reason: d?.allInBps ? `${d.allInBps} bps at ${d.source === "user" ? "your" : "the scenario"} ${d.feeBps} bps fee is over your ${res.ceilingBps} bps ceiling` : "the visible book cannot fill this order",
      ...(clip?.qty ? { proposal: { size: clip.qty, unit, remainder: clip.remainder ?? "0", note: "a smaller order; nothing is prepared until you choose it" } } : {}),
    };
  }
  const order = orderFor(res.symbol, res.intent, res.leg!.deepestPrice!, Number(res.spec!.quantityPrecision));
  if (D(order.qty).lt(res.spec!.minOrderQty) || D(order.qty).mul(order.price).lt(res.spec!.minOrderAmount))
    return { status: "refused", code: "BELOW_MIN_ORDER", reason: `at ${order.price} the budget buys ${order.qty} sh, under Bitget's minimum order` };
  const binding: Binding = {
    engineVersion: res.receipt.engineVersion, receipt_sha256: res.receipt.receipt_sha256!, exchange_ts: res.receipt.exchange_ts, symbol: res.symbol,
    intent: res.intent, ceilingBps: res.ceilingBps, allInBps: d.allInBps!, worstCaseBps: worstCase(res, order.price, d.feeBps), fee: { bps: d.feeBps, source: d.source === "user" ? feeSource : "scenario" },
    order_sha256: sha256(canonicalJson(order)), prepared_at: now.toISOString(),
  };
  const binding_sha256 = sha256(canonicalJson(binding));
  // A recorded book is for showing the mechanism: verify rejects it as stale, and it says so here too.
  return { status: "prepared", order, command: bgcCommand(order), binding, binding_sha256, signature: signReceiptHash(binding_sha256), signed: canSign(), book: res.freshness.historical ? "recorded" : "live" };
}

function worstCase(res: SoundingResult, limit: string, feeBps: number): string {
  const mid = D(res.referenceMid!), pre = (res.intent.side === "sell" ? mid.minus(limit) : D(limit).minus(mid)).div(mid).mul(10000);
  return allInFrom(pre, feeBps, res.intent.side).toFixed(2);
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
