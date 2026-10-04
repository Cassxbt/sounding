import { NextResponse } from "next/server";
import { sound } from "@/engine";
import { lastLook, LastLookInputError, verifyReceipt } from "@/engine/lastlook";
import type { SoundingResult } from "@/engine/types";
import { liveCapture, LiveMetadataUnavailable, recordedCapture, universe } from "@/lib/data";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface Body { original: SoundingResult; mode: "recorded" | "live"; freshFixture?: string }

/** A sounding with its receipt is a few hundred KB at most; anything larger is not a sounding. */
const MAX_BODY_BYTES = 512 * 1024;

/** Last Look: re-walk a fresh book for the exact order the trader is confirming; the decision stands only if nothing material moved. */
export async function POST(req: Request) {
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return NextResponse.json({ error: "request too large" }, { status: 413 });
  const text = await req.text();
  if (Buffer.byteLength(text) > MAX_BODY_BYTES) return NextResponse.json({ error: "request too large" }, { status: 413 });
  let b: Body;
  try { b = JSON.parse(text) as Body; } catch { return NextResponse.json({ error: "body must be JSON" }, { status: 400 }); }
  if (!b.original?.receipt) return NextResponse.json({ error: "original sounding with its receipt is required" }, { status: 400 });
  const r = b.original.receipt;
  // Nothing is fetched or walked for a receipt this server cannot vouch for.
  if (!verifyReceipt(r)) return NextResponse.json({ error: "original receipt does not verify; nothing to confirm" }, { status: 422 });
  const mode = b.mode === "live" ? "live" : "recorded";
  if (r.historical !== (mode === "recorded"))
    return NextResponse.json({ error: r.historical ? "a recorded decision cannot be confirmed on a live book; re-sound live" : "a live decision is confirmed on a live book only" }, { status: 422 });
  let capture, historical: boolean;
  if (mode === "recorded") {
    capture = b.freshFixture ? recordedCapture(b.freshFixture) : null; historical = true;
    if (!capture || capture.symbol !== r.symbol) return NextResponse.json({ error: "recorded Last Look needs a later recorded book for the same symbol" }, { status: 404 });
  } else {
    try { capture = await liveCapture(r.symbol); historical = false; }
    catch (e) { return NextResponse.json({ error: `live book unavailable: ${(e as Error).message}` }, { status: 502 }); }
  }
  let u;
  try { u = await universe(mode); }
  catch (e) { if (e instanceof LiveMetadataUnavailable) return NextResponse.json({ error: `live Bitget metadata unavailable (${e.message}); nothing is confirmed on recorded rules` }, { status: 503 }); throw e; }
  const outputs = (r.outputs ?? {}) as { fees?: { source: string; feeBps: number }[] };
  const userFee = outputs.fees?.find((f) => f.source === "user")?.feeBps;
  const fresh = sound({
    capture, intent: r.intent, ceilingBps: r.ceilingBps, userFeeBps: userFee,
    now: historical ? new Date(Number(capture.exchange_ts)) : new Date(), historical,
    stockInfo: u.stockInfo, states: u.states, calendar: u.calendar, instruments: u.instruments,
  });
  try {
    const look = lastLook(b.original, fresh);
    return NextResponse.json({ look, levels: { asks: capture.raw.data.asks.slice(0, 40), bids: capture.raw.data.bids.slice(0, 40) } });
  } catch (e) {
    if (e instanceof LastLookInputError) return NextResponse.json({ error: e.message }, { status: 422 });
    throw e;
  }
}
