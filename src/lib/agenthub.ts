import Decimal from "decimal.js";
import { D, type Intent } from "@/engine/types";

/**
 * Sounding's two touch points with Bitget Agent Hub (@bitget-ai/bitget-agent-sdk, pinned).
 * The fee is read through Agent Hub's own read-only client; the order is handed back in the exact shape of
 * Agent Hub's `order` tool, so an agent sends what Sounding checked and nothing else.
 */

export interface AccountFee { bps: number; source: "bitget_account"; symbol: string; asOf: string }

/** The trader's taker fee for one symbol via getAccountFeeRate (what `account_overview` calls). null without a key. */
export async function accountFee(symbol: string): Promise<AccountFee | null> {
  const { BitgetRestClient, loadConfig } = await import("@bitget-ai/bitget-agent-sdk");
  const config = loadConfig({ readOnly: true });
  if (!config.hasAuth) return null;
  const r = await new BitgetRestClient(config).callOperation<{ takerFeeRate?: string }>("getAccountFeeRate", { category: "SPOT", symbol });
  const rate = Number(r.data?.takerFeeRate);
  if (!Number.isFinite(rate) || rate < 0) return null;
  const at = Number(r.requestTime);
  return { bps: Math.round(rate * 1e10) / 1e6, source: "bitget_account", symbol, asOf: new Date(Number.isFinite(at) && at > 0 ? at : Date.now()).toISOString() };
}

/**
 * Arguments for Agent Hub's `order` tool: a limit IOC at the deepest price the walk reached, so Bitget itself fills no
 * share past the price Sounding checked and cancels what it cannot fill at once. Bitget's weekend rules list limit orders.
 * A limit order is sized in shares; a buy takes as many as its budget covers at that price, so it never spends more.
 */
export interface AgentHubOrder { action: "place"; category: "SPOT"; symbol: string; side: "buy" | "sell"; orderType: "limit"; price: string; timeInForce: "ioc"; qty: string }

export function orderFor(symbol: string, intent: Intent, deepestPrice: string, qtyDp: number): AgentHubOrder {
  const qty = intent.side === "sell" ? intent.baseQty : D(intent.quoteBudget).div(deepestPrice).toDecimalPlaces(qtyDp, Decimal.ROUND_DOWN).toString();
  return { action: "place", category: "SPOT", symbol, side: intent.side, orderType: "limit", price: deepestPrice, timeInForce: "ioc", qty };
}

/** The same order as the `bgc` command an agent previews first; the trader still confirms the send. */
export const bgcCommand = (o: AgentHubOrder) => `bgc order --action place --category SPOT --symbol ${o.symbol} --side ${o.side} --orderType limit --price ${o.price} --timeInForce ioc --qty ${o.qty} --dry-run`;
