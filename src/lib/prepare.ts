import { canonicalJson, receiptSignatureValid, sha256, signReceiptHash } from "@/engine/book";
import { decidingRow, MAX_DECISION_AGE_MS } from "@/engine/decision";
import type { Intent, SoundingResult } from "@/engine/types";
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
  fee: { bps: number; source: FeeSource };
  order_sha256: string;
  prepared_at: string;
}

export type Preparation =
  | { status: "prepared"; order: AgentHubOrder; command: string; binding: Binding; binding_sha256: string; signature?: string }
  | { status: "refused"; reason: string; proposal?: { size: string; unit: "sh" | "USDT"; remainder: string; note: string } };

const WITHIN = "WITHIN_CEILING_ON_THIS_SNAPSHOT";

/**
 * The step Agent Hub's own flow leaves open: between its dry run and the confirmation card nothing checks what the
 * size costs. An order comes back only when the engine finds it within the trader's ceiling at a known fee; anything
 * else comes back as a reason, and a smaller size is a new order the trader has to choose.
 */
export function prepare(res: SoundingResult, feeSource: FeeSource, now: Date): Preparation {
  if (!res.ok) return { status: "refused", reason: `the engine refused this order: ${res.gateDetail ?? res.gate}` };
  if (res.feeSensitive) return { status: "refused", reason: "your fee decides this order and it is not known: state it, or read it from your account with a read-only key" };
  const d = decidingRow(res);
  if (!d || d.verdict !== WITHIN) {
    const clip = res.alternatives?.find((a) => a.kind === "largest_within_ceiling");
    const unit = res.intent.side === "sell" ? "sh" : "USDT";
    return {
      status: "refused",
      reason: d?.allInBps ? `${d.allInBps} bps at your ${d.feeBps} bps fee is over your ${res.ceilingBps} bps ceiling` : "the visible book cannot fill this order",
      ...(clip?.qty ? { proposal: { size: clip.qty, unit, remainder: clip.remainder ?? "0", note: "a smaller order; nothing is prepared until you choose it" } } : {}),
    };
  }
  const order = orderFor(res.symbol, res.intent);
  const binding: Binding = {
    engineVersion: res.receipt.engineVersion, receipt_sha256: res.receipt.receipt_sha256!, exchange_ts: res.receipt.exchange_ts, symbol: res.symbol,
    intent: res.intent, ceilingBps: res.ceilingBps, allInBps: d.allInBps!, fee: { bps: d.feeBps, source: d.source === "user" ? feeSource : "scenario" },
    order_sha256: sha256(canonicalJson(order)), prepared_at: now.toISOString(),
  };
  const binding_sha256 = sha256(canonicalJson(binding));
  return { status: "prepared", order, command: bgcCommand(order), binding, binding_sha256, signature: signReceiptHash(binding_sha256) };
}

/** Before sending: the order must be the one checked, issued by this server, and recent enough to stand. */
export function verifyPrepared(order: AgentHubOrder, binding: Binding, signature: string | undefined, now: Date): { ok: true } | { ok: false; reason: string } {
  if (sha256(canonicalJson(order)) !== binding.order_sha256) return { ok: false, reason: "the order differs from the one Sounding checked" };
  if (!receiptSignatureValid(sha256(canonicalJson(binding)), signature)) return { ok: false, reason: "this preparation was not issued by Sounding" };
  if (now.getTime() - Date.parse(binding.prepared_at) > MAX_DECISION_AGE_MS) return { ok: false, reason: "older than two minutes: sound the order again before sending" };
  return { ok: true };
}
