import { sound, rawHash } from "@/engine";
import { decidingRow } from "@/engine/decision";
import type { BookCapture, SoundingResult } from "@/engine/types";
import { regexIntake } from "@/analyst/intake";
import { EMPTY_CONSTRAINTS } from "@/analyst";
import { recordedCapture, universe, type Universe } from "./data";

/**
 * The deletion test, run by the engine itself: the lead order on the recorded rHIMS book, once with every
 * sponsor input, then once with each input withheld. Nothing here is written by hand; a removal that stopped
 * breaking the product would show up on the page (and in the test that pins it).
 */

export const LEAD_TEXT = "Sell 178.4121 rHIMS. I pay 0.08% taker, keep it under half a percent all-in, and I must be out before the 8th.";

export interface Outcome { ok: boolean; headline: string; code?: string; detail?: string; allInBps?: string; within?: boolean }
export interface DeletionRow {
  id: "book" | "stockInfo" | "session" | "instruments" | "qwen";
  name: string;
  source: string;
  callSite: string;
  role: string;
  without: Outcome;
}

function outcome(r: SoundingResult): Outcome {
  if (!r.ok) return { ok: false, headline: "Refused", code: r.gate, detail: r.gateDetail };
  const d = decidingRow(r)!;
  const within = d.verdict === "WITHIN_CEILING_ON_THIS_SNAPSHOT";
  return { ok: true, headline: `${d.allInBps} bps, ${within ? "within" : "over"}`, allInBps: d.allInBps, within, detail: `deciding fee ${d.feeBps} bps${d.source === "user" ? " (stated)" : " (worst case: no fee was read)"}` };
}

export async function deletionTest(): Promise<{ baseline: Outcome; rows: DeletionRow[]; regexRead: { fee: number | null; deadline: string | null; size?: string } }> {
  const u: Universe = await universe("recorded");
  const capture = () => structuredClone(recordedCapture("RHIMSUSDT") as BookCapture);
  const run = (o: Partial<Parameters<typeof sound>[0]> = {}) => {
    const c = o.capture ?? capture();
    return sound({ capture: c, intent: { side: "sell", baseQty: "178.4121" }, ceilingBps: 50, userFeeBps: 8, now: new Date(Number(c.exchange_ts)), historical: true, stockInfo: u.stockInfo, states: u.states, calendar: u.calendar, instruments: u.instruments, ...o });
  };

  const empty = capture();
  empty.raw.data.bids = []; empty.raw.data.asks = [];
  empty.raw_sha256 = rawHash(empty.raw);

  const rx = regexIntake(LEAD_TEXT, EMPTY_CONSTRAINTS);
  const withoutQwen = run({ userFeeBps: rx.constraints.takerFeeBps ?? undefined });

  return {
    baseline: outcome(run()),
    regexRead: { fee: rx.constraints.takerFeeBps, deadline: rx.constraints.hardDeadlineNy, size: rx.sizeShares },
    rows: [
      { id: "book", name: "Spot order book", source: "Bitget public API", callSite: "GET /api/v2/spot/market/orderbook?limit=150", role: "The depth the order is walked through, level by level, at your exact size.", without: outcome(run({ capture: empty })) },
      { id: "stockInfo", name: "Reality stock-info", source: "Bitget public API", callSite: "GET /api/v3/reality/market/stock-info", role: "Which rTokens exist, and which Bitget flags weekend-tradable.", without: outcome(run({ stockInfo: [] })) },
      { id: "session", name: "Market states and calendar", source: "Bitget public API", callSite: "GET /api/v3/reality/market/states · /calendar", role: "Which session is open, the holidays, and when the next session starts.", without: outcome(run({ states: null, calendar: null })) },
      { id: "instruments", name: "Instrument rules", source: "Bitget public API", callSite: "GET /api/v3/market/instruments?category=SPOT", role: "Quantity precision and minimum order, so a size the exchange would reject is refused first.", without: outcome(run({ instruments: [] })) },
      { id: "qwen", name: "Qwen 3.8 Max", source: "Bitget S2 model endpoint", callSite: "POST hackathon.bitgetops.com/v1/chat/completions", role: "Reads the trader's own words, English or 中文, and quotes them for every limit; code checks each quote before the engine uses it.", without: outcome(withoutQwen) },
    ],
  };
}
