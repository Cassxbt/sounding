import { NextResponse } from "next/server";
import { sound } from "@/engine";
import { lastLook, LastLookInputError, DEFAULT_LASTLOOK_TOLERANCE_BPS } from "@/engine/lastlook";
import type { SoundingResult } from "@/engine/types";
import { liveCapture, recordedCapture, universe } from "@/lib/data";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface Body { original: SoundingResult; mode: "recorded" | "live"; toleranceBps?: number; freshFixture?: string }

/** Last Look: re-walk a fresh book for the exact order the trader is confirming; the decision stands only if nothing material moved. */
export async function POST(req: Request) {
  const b = (await req.json()) as Body;
  if (!b.original?.receipt) return NextResponse.json({ error: "original sounding with its receipt is required" }, { status: 400 });
  const r = b.original.receipt;
  const mode = b.mode === "live" ? "live" : "recorded";
  let capture, historical: boolean;
  if (mode === "recorded") {
    capture = b.freshFixture ? recordedCapture(b.freshFixture) : null; historical = true;
    if (!capture || capture.symbol !== r.symbol) return NextResponse.json({ error: "recorded Last Look needs a later recorded book for the same symbol" }, { status: 404 });
  } else {
    try { capture = await liveCapture(r.symbol); historical = false; }
    catch (e) { return NextResponse.json({ error: `live book unavailable: ${(e as Error).message}` }, { status: 502 }); }
  }
  const u = await universe(mode);
  const outputs = (r.outputs ?? {}) as { fees?: { source: string; feeBps: number }[] };
  const userFee = outputs.fees?.find((f) => f.source === "user")?.feeBps;
  const fresh = sound({
    capture, intent: r.intent, ceilingBps: r.ceilingBps, userFeeBps: userFee,
    now: historical ? new Date(Number(capture.exchange_ts)) : new Date(), historical,
    stockInfo: u.stockInfo, states: u.states, calendar: u.calendar, instruments: u.instruments,
  });
  try {
    const look = lastLook(b.original, fresh, Number(b.toleranceBps) || DEFAULT_LASTLOOK_TOLERANCE_BPS);
    return NextResponse.json({ look, levels: { asks: capture.raw.data.asks.slice(0, 40), bids: capture.raw.data.bids.slice(0, 40) } });
  } catch (e) {
    if (e instanceof LastLookInputError) return NextResponse.json({ error: e.message }, { status: 422 });
    throw e;
  }
}
