import { NextResponse } from "next/server";
import { sound } from "@/engine";
import type { Intent } from "@/engine/types";
import { LiveMetadataUnavailable, universe } from "@/lib/data";
import { bookFor, errorJson, parseAmount, parseTerms } from "@/lib/terms";
import { accountFee, type AgentHubOrder } from "@/lib/agenthub";
import { prepare, verifyPrepared, type Binding, type FeeSource } from "@/lib/prepare";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface Body {
  symbol: string; side: "buy" | "sell"; amount: string; ceilingBps?: unknown; userFeeBps?: unknown; mode: "recorded" | "live"; fixture?: string;
  verify?: { order: AgentHubOrder; binding: Binding; signature?: string };
}

/**
 * Prepares the Agent Hub order for a sounded decision, or verifies one before it is sent.
 * The fee is the trader's stated one; else, where this server holds a read-only key, the account's own via Agent Hub;
 * else Bitget's published scenarios, and an order whose answer depends on them is not prepared.
 */
export async function POST(req: Request) {
  let b: Body;
  try { b = (await req.json()) as Body; } catch { return NextResponse.json({ error: "body must be JSON" }, { status: 400 }); }
  if (b.verify) {
    const v = b.verify;
    if (!v.order || !v.binding || typeof v.binding.prepared_at !== "string") return NextResponse.json({ error: "verify needs order, binding and signature from a preparation" }, { status: 400 });
    return NextResponse.json(verifyPrepared(v.order, v.binding, v.signature, new Date()));
  }
  if (!b.symbol || (b.side !== "buy" && b.side !== "sell")) return NextResponse.json({ error: "symbol and side (buy or sell) required" }, { status: 400 });
  // An order is prepared only against the trader's own ceiling; there is no default to fall back on.
  if (b.ceilingBps === undefined || b.ceilingBps === null || b.ceilingBps === "") return NextResponse.json({ error: "ceilingBps required: the most the trader accepts, all-in" }, { status: 400 });
  const mode = b.mode === "live" ? "live" : "recorded";
  try {
    const amount = parseAmount(b.amount);
    const { ceilingBps, userFeeBps } = parseTerms(b);
    const intent: Intent = b.side === "buy" ? { side: "buy", quoteBudget: amount } : { side: "sell", baseQty: amount };
    let fee: { bps?: number; source: FeeSource; asOf?: string; note?: string } = userFeeBps !== undefined ? { bps: userFeeBps, source: "stated" } : { source: "scenario" };
    if (userFeeBps === undefined) {
      try { const a = await accountFee(b.symbol); if (a) fee = { bps: a.bps, source: a.source, asOf: a.asOf }; }
      catch (e) { fee = { source: "scenario", note: `account fee not read: ${(e as Error).message}` }; }
    }
    const u = await universe(mode);
    const { capture, historical } = await bookFor(mode, b.symbol, b.fixture);
    const now = historical ? new Date(Number(capture.exchange_ts)) : new Date();
    const result = sound({ capture, intent, ceilingBps, now, historical, stockInfo: u.stockInfo, states: u.states, calendar: u.calendar, instruments: u.instruments, userFeeBps: fee.bps });
    return NextResponse.json({ preparation: prepare(result, fee.source, historical ? now : new Date()), fee, receipt_sha256: result.receipt.receipt_sha256, ...(fee.source === "bitget_account" ? { feeReadBy: "@bitget-ai/bitget-agent-sdk@3.3.1 getAccountFeeRate" } : {}) });
  } catch (e) {
    if (e instanceof LiveMetadataUnavailable) return NextResponse.json({ error: `live Bitget metadata unavailable (${e.message}); nothing is prepared on recorded rules` }, { status: 503 });
    const j = errorJson(e);
    if (j) return NextResponse.json(j.body, { status: j.status });
    throw e;
  }
}
