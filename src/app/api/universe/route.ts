import { NextResponse } from "next/server";
import { universe } from "@/lib/data";
import { classifySession } from "@/engine/session";

export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const mode = new URL(req.url).searchParams.get("mode") === "live" ? "live" : "recorded";
  const u = await universe(mode);
  const eligible = u.stockInfo.filter((s) => s.weekendTradable === "yes").map((s) => ({ symbol: s.symbol, code: s.code, name: s.name }));
  const now = new Date();
  const sess = classifySession(now, u.states, u.calendar);
  return NextResponse.json({ source: u.source, fetched_utc: u.fetched_utc, total: u.stockInfo.length, eligibleCount: eligible.length, eligible, session: { state: sess.state, detail: sess.detail, ny: sess.clock }, now_utc: now.toISOString() });
}
