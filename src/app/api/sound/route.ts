import { NextResponse } from "next/server";
import { sound } from "@/engine";
import type { Intent } from "@/engine/types";
import { liveCapture, recordedCapture, universe } from "@/lib/data";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface Body { symbol: string; side: "buy" | "sell"; amount: string; ceilingBps: number; userFeeBps?: number; mode: "recorded" | "live"; previousBpsPreFee?: string }

export async function POST(req: Request) {
  const b = (await req.json()) as Body;
  if (!b.symbol || !b.side || !b.amount || !(Number(b.amount) > 0)) return NextResponse.json({ error: "symbol, side, positive amount required" }, { status: 400 });
  const intent: Intent = b.side === "buy" ? { side: "buy", quoteBudget: b.amount } : { side: "sell", baseQty: b.amount };
  const mode = b.mode === "live" ? "live" : "recorded";
  let capture, historical: boolean;
  if (mode === "recorded") {
    capture = recordedCapture(b.symbol); historical = true;
    if (!capture) return NextResponse.json({ error: `no recorded fixture for ${b.symbol}; use live mode` }, { status: 404 });
  } else {
    try { capture = await liveCapture(b.symbol); historical = false; }
    catch (e) { return NextResponse.json({ error: `live book unavailable: ${(e as Error).message}` }, { status: 502 }); }
  }
  const u = await universe(mode);
  const now = historical ? new Date(Number(capture.exchange_ts)) : new Date();
  const result = sound({ capture, intent, ceilingBps: Number(b.ceilingBps) || 50, now, historical, stockInfo: u.stockInfo, states: u.states, calendar: u.calendar, instruments: u.instruments, userFeeBps: b.userFeeBps === undefined || b.userFeeBps === null ? undefined : Number(b.userFeeBps), previousBpsPreFee: b.previousBpsPreFee });
  const levels = { asks: capture.raw.data.asks.slice(0, 40), bids: capture.raw.data.bids.slice(0, 40) };
  return NextResponse.json({ result, levels, universe: { source: u.source, fetched_utc: u.fetched_utc }, capture: { ...capture, raw: undefined } });
}
