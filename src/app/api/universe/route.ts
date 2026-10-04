import { NextResponse } from "next/server";
import { LiveMetadataUnavailable, universe } from "@/lib/data";
import { classifySession } from "@/engine/session";

export const dynamic = "force-dynamic";
export const maxDuration = 30;
export async function GET(req: Request) {
  const mode = new URL(req.url).searchParams.get("mode") === "live" ? "live" : "recorded";
  let u;
  try { u = await universe(mode); }
  catch (e) { if (e instanceof LiveMetadataUnavailable) return NextResponse.json({ error: `live Bitget metadata unavailable (${e.message})` }, { status: 503 }); throw e; }
  const eligible = u.stockInfo.filter((s) => s.weekendTradable === "yes").map((s) => ({ symbol: s.symbol, code: s.code, name: s.name }));
  const now = new Date();
  const sess = classifySession(now, u.states, u.calendar);
  return NextResponse.json({ source: u.source, fetched_utc: u.fetched_utc, total: u.stockInfo.length, eligibleCount: eligible.length, eligible, session: { state: sess.state, detail: sess.detail, ny: sess.clock }, now_utc: now.toISOString() });
}
