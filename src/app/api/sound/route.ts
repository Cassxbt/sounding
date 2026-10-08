import { NextResponse } from "next/server";
import { sound } from "@/engine";
import type { Intent } from "@/engine/types";
import { LiveMetadataUnavailable, universe } from "@/lib/data";
import { bookFor, errorJson, parseAmount, parseTerms } from "@/lib/terms";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface Body { symbol: string; side: "buy" | "sell"; amount: string; ceilingBps?: unknown; userFeeBps?: unknown; mode: "recorded" | "live"; previousBpsPreFee?: string; fixture?: string }

export async function POST(req: Request) {
  let b: Body;
  try { b = (await req.json()) as Body; } catch { return NextResponse.json({ error: "body must be JSON" }, { status: 400 }); }
  if (!b.symbol || (b.side !== "buy" && b.side !== "sell")) return NextResponse.json({ error: "symbol and side (buy or sell) required" }, { status: 400 });
  if (b.previousBpsPreFee !== undefined && !/^-?\d+(\.\d+)?$/.test(String(b.previousBpsPreFee))) return NextResponse.json({ error: "previousBpsPreFee must be a number" }, { status: 400 });
  const mode = b.mode === "live" ? "live" : "recorded";
  try {
    const amount = parseAmount(b.amount);
    const { ceilingBps, userFeeBps } = parseTerms(b);
    const intent: Intent = b.side === "buy" ? { side: "buy", quoteBudget: amount } : { side: "sell", baseQty: amount };
    const u = await universe(mode);
    const { capture, historical, fixtureFile } = await bookFor(mode, b.symbol, b.fixture);
    const now = historical ? new Date(Number(capture.exchange_ts)) : new Date();
    const result = sound({ capture, intent, ceilingBps, now, historical, stockInfo: u.stockInfo, states: u.states, calendar: u.calendar, instruments: u.instruments, userFeeBps, previousBpsPreFee: b.previousBpsPreFee });
    const levels = { asks: capture.raw.data.asks.slice(0, 40), bids: capture.raw.data.bids.slice(0, 40) };
    // The full capture travels with the result, so a downloaded receipt can be replayed.
    return NextResponse.json({ result, levels, universe: { source: u.source, fetched_utc: u.fetched_utc }, capture, fixtureFile, sessionInputs: { states: u.states, calendar: u.calendar }, previousBpsPreFee: b.previousBpsPreFee });
  } catch (e) {
    if (e instanceof LiveMetadataUnavailable) return NextResponse.json({ error: `live Bitget metadata unavailable (${e.message}); nothing is priced on recorded rules` }, { status: 503 });
    const j = errorJson(e);
    if (j) return NextResponse.json(j.body, { status: j.status });
    throw e;
  }
}
