import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { BookCapture, InstrumentSpec, RawOrderbook } from "@/engine/types";
import type { StockInfo } from "@/engine/eligibility";
import type { Calendar, MarketStates } from "@/engine/session";
import { rawHash } from "@/engine/book";

const FX = join(process.cwd(), "fixtures");
const read = <T>(f: string): T => JSON.parse(readFileSync(join(FX, f), "utf8"));

export const FIXTURES: Record<string, string> = {
  RHIMSUSDT: "rhims-20260920T090235Z.json",
  RSPYUSDT: "rspy-20260920T0902Z.json",
  RSPMOUSDT: "rspmo-20260920T0902Z.json",
  // Two real Saturday captures 21 s apart, for the recorded Last Look demo.
  "RHIMSUSDT@20261003a": "rhims-20261003T011955Z.json",
  "RHIMSUSDT@20261003b": "rhims-20261003T012016Z.json",
};
export const recordedCapture = (key: string): BookCapture | null => (Object.hasOwn(FIXTURES, key) ? read<BookCapture>(FIXTURES[key]) : null);

export interface Universe { stockInfo: StockInfo[]; states: MarketStates; calendar: Calendar; instruments: InstrumentSpec[]; source: "live" | "recorded"; fetched_utc: string }

const recordedUniverse = (): Universe => ({
  stockInfo: read<{ data: StockInfo[] }>("stock-info-20260920.json").data,
  states: read<{ states: MarketStates }>("market-states-20260920.json").states,
  calendar: read<Calendar>("calendar-20260920.json"),
  instruments: read<{ rows: InstrumentSpec[] }>("instruments-20260923.json").rows,
  source: "recorded", fetched_utc: "2026-09-20T04:04:00Z",
});

let cache: { at: number; u: Universe } | null = null;
const API = "https://api.bitget.com";
async function getJson<T>(path: string, ms = 8000): Promise<T> {
  const r = await fetch(API + path, { signal: AbortSignal.timeout(ms), cache: "no-store" });
  if (!r.ok) throw new Error(`${path} -> ${r.status}`);
  return r.json();
}

/** Live eligibility/session inputs with a 10-minute cache. Live fails closed: an answer on a live book is never
 *  decided with recorded rules, so a failed fetch is an error, not a fallback. */
export async function universe(mode: "live" | "recorded"): Promise<Universe> {
  if (mode === "recorded") return recordedUniverse();
  if (cache && Date.now() - cache.at < 600_000) return cache.u;
  try {
    const [si, st, cal, ins] = await Promise.all([
      getJson<{ data: StockInfo[] }>("/api/v3/reality/market/stock-info"),
      getJson<{ data: MarketStates }>("/api/v3/reality/market/states"),
      getJson<{ data: Calendar }>("/api/v3/reality/market/calendar"),
      getJson<{ data: InstrumentSpec[] }>("/api/v3/market/instruments?category=SPOT", 15000),
    ]);
    const reality = new Set(si.data.map((x) => x.symbol));
    const instruments = ins.data.filter((x) => reality.has(x.symbol));
    cache = { at: Date.now(), u: { stockInfo: si.data, states: st.data, calendar: cal.data, instruments, source: "live", fetched_utc: new Date().toISOString() } };
    return cache.u;
  } catch (e) {
    throw new LiveMetadataUnavailable((e as Error).message);
  }
}

export class LiveMetadataUnavailable extends Error {}

/** Live public spot book with request timing and a measured clock offset (local vs server requestTime). */
export async function liveCapture(symbol: string): Promise<BookCapture> {
  const start = new Date(); const t0 = performance.now();
  const raw = await getJson<RawOrderbook>(`/api/v2/spot/market/orderbook?symbol=${encodeURIComponent(symbol)}&limit=150`);
  const rtt = Math.round(performance.now() - t0);
  const localMid = start.getTime() + rtt / 2;
  return {
    symbol, raw, raw_sha256: rawHash(raw), request_start_utc: start.toISOString(), rtt_ms: rtt,
    exchange_ts: raw.data.ts, server_requestTime: raw.requestTime,
    clock_offset_ms: raw.requestTime ? Math.round(localMid - raw.requestTime) : undefined,
    source: "public spot orderbook v2 limit=150 (matches Bitget UI, verified 2026-09-20 for RHOODUSDT)",
  };
}
