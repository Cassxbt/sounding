import { sound, rawHash } from "@/engine";
import { decidingRow } from "@/engine/decision";
import type { BookCapture, SoundingResult } from "@/engine/types";
import { regexIntake } from "@/analyst/intake";
import { readBps } from "@/analyst/normalize";
import { EMPTY_CONSTRAINTS } from "@/analyst";
import { nyClock } from "@/engine/session";
import { recordedCapture, universe, type Universe } from "./data";

/**
 * The deletion test, run by the engine itself: the lead order on the recorded rHIMS book, once with every
 * sponsor input, then once with each input withheld. Nothing here is written by hand; a removal that stopped
 * breaking the product would show up on the page (and in the test that pins it).
 */

import { LEAD_CEILING_WORDS, LEAD_FEE_WORDS, LEAD_TEXT } from "./lead";
export { LEAD_TEXT };

export interface Outcome { ok: boolean; headline: string; code?: string; detail?: string; allInBps?: string; within?: boolean }
export interface DeletionRow {
  id: "book" | "stockInfo" | "session" | "instruments" | "qwen";
  name: string;
  source: string;
  callSite: string;
  role: string;
  /** what the engine answers with this input present; for Qwen, with the fee read from the trader's words and confirmed by code */
  with: Outcome;
  without: Outcome;
  /** why the refusal is the safe behaviour, not a lookup error */
  why: string;
}

function outcome(r: SoundingResult): Outcome {
  if (!r.ok) return { ok: false, headline: "Refused", code: r.gate, detail: r.gateDetail };
  const d = decidingRow(r)!;
  const within = d.verdict === "WITHIN_CEILING_ON_THIS_SNAPSHOT";
  return { ok: true, headline: `${d.allInBps} bps, ${within ? "within" : "over"}`, allInBps: d.allInBps, within, detail: `deciding fee ${d.feeBps} bps${d.source === "user" ? " (stated)" : " (the higher scenario: no fee was read)"}` };
}

export async function deletionTest(): Promise<{ baseline: Outcome; rows: DeletionRow[]; regexRead: { fee: number | null; ceiling: number | null; deadline: string | null; size?: string; asked: string | null } }> {
  const u: Universe = await universe("recorded");
  const capture = () => structuredClone(recordedCapture("RHIMSUSDT") as BookCapture);
  const run = (o: Partial<Parameters<typeof sound>[0]> = {}) => {
    const c = o.capture ?? capture();
    return sound({ capture: c, intent: { side: "sell", baseQty: "178.4121" }, ceilingBps: readBps(LEAD_CEILING_WORDS)!, userFeeBps: readBps(LEAD_FEE_WORDS)!, now: new Date(Number(c.exchange_ts)), historical: true, stockInfo: u.stockInfo, states: u.states, calendar: u.calendar, instruments: u.instruments, ...o });
  };

  const empty = capture();
  empty.raw.data.bids = []; empty.raw.data.asks = [];
  empty.raw_sha256 = rawHash(empty.raw);

  // With Qwen: the fee and the ceiling come from the quoted words, and only after code reads the same numbers from them.
  // Without it, the fallback reader cannot read "0.05%", "0.3%" or "before the 8th", so it can only ask again.
  const all = outcome(run());
  const rx = regexIntake(LEAD_TEXT, EMPTY_CONSTRAINTS, nyClock(new Date(Number(capture().exchange_ts))).date);
  const withoutQwen: Outcome = rx.clarification ? { ok: false, headline: "Asked, not answered", detail: rx.clarification } : outcome(run({ userFeeBps: rx.constraints.takerFeeBps ?? undefined, ceilingBps: rx.ceilingBps ?? 50 }));

  return {
    baseline: all,
    regexRead: { fee: rx.constraints.takerFeeBps, ceiling: rx.ceilingBps ?? null, deadline: rx.constraints.hardDeadlineNy, size: rx.sizeShares, asked: rx.clarification },
    rows: [
      { id: "book", name: "Spot order book", source: "Bitget public API", callSite: "GET /api/v2/spot/market/orderbook?limit=150", role: "The depth the order is walked through, level by level, at your exact size.", with: all, without: outcome(run({ capture: empty })), why: "With no book there is no price at your size, only a guess, so nothing is answered." },
      { id: "stockInfo", name: "Reality stock-info", source: "Bitget public API", callSite: "GET /api/v3/reality/market/stock-info", role: "Which rTokens exist, and which Bitget flags weekend-tradable.", with: all, without: outcome(run({ stockInfo: [] })), why: "Without Bitget's list it cannot tell a real rToken from a typo, or whether this one trades on a weekend, so it refuses rather than sound a name that may not trade." },
      { id: "session", name: "Market states and calendar", source: "Bitget public API", callSite: "GET /api/v3/reality/market/states · /calendar", role: "Which session is open, the holidays, and when the next session starts.", with: all, without: outcome(run({ states: null, calendar: null })), why: "Weekend books are market-maker books and close at the switch; without the session it cannot say which book you are looking at, or when it ends." },
      { id: "instruments", name: "Instrument rules", source: "Bitget public API", callSite: "GET /api/v3/market/instruments?category=SPOT", role: "Quantity precision and minimum order, so a size the exchange would reject is refused first.", with: all, without: outcome(run({ instruments: [] })), why: "Without the rules it cannot tell whether 178.4121 shares is a size Bitget accepts, so it refuses rather than price an order the exchange would reject." },
      { id: "qwen", name: "Qwen 3.8 Max", source: "Bitget S2 model endpoint", callSite: "POST hackathon.bitgetops.com/v1/chat/completions", role: "Reads the trader's own words, English or 中文, and quotes them for every limit; code checks each quote before the engine uses it.", with: { ...all, detail: `fee from "${LEAD_FEE_WORDS}" and ceiling from "${LEAD_CEILING_WORDS}", each confirmed by code` }, without: withoutQwen, why: "Limits said the way traders say them (a percent, \"before the 8th\") are beyond the fallback reader, so it cannot answer on this trader's own limits and asks for them again." },
    ],
  };
}
