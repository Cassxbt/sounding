import Decimal from "decimal.js";
import { buyWithBudget, canonicalJson, largestBuyWithin, largestSellWithin, rawHash, sellShares, sha256, validateBook } from "./book";
import { eligibilityFor, type StockInfo } from "./eligibility";
import { classifySession, nextSwitchHint, type Calendar, type MarketStates } from "./session";
import type { Alternative, BookCapture, CostVerdict, FeeScenario, Intent, LegCost, Receipt, SoundingResult } from "./types";
import { D } from "./types";

export const ENGINE_VERSION = "sounding-engine/0.1.0";
export const DEFAULT_FEE_SCENARIOS_BPS = [0, 10, 20];
export const FRESHNESS = { maxExchangeAgeMs: 5000, maxRttMs: 2000, maxClockOffsetMs: 2000 };
export const STABILITY_BPS = 10;

export interface SoundingInput {
  capture: BookCapture;
  intent: Intent;
  ceilingBps: number;
  /** wall clock at evaluation; for recorded fixtures pass the capture time and set historical=true */
  now: Date;
  historical: boolean;
  stockInfo: StockInfo[] | null;
  states: MarketStates | null;
  calendar: Calendar | null;
  userFeeBps?: number;
  /** previous snapshot's pre-fee bps at this size, for the stability gate */
  previousBpsPreFee?: string;
  minNotionalUsdt?: string;
}

function receiptFor(i: SoundingInput, session: SoundingResult["session"], gate: Receipt["gate"], outputs: unknown): Receipt {
  const r: Receipt = {
    engineVersion: ENGINE_VERSION, symbol: i.capture.symbol, source: i.capture.source, raw_sha256: i.capture.raw_sha256,
    exchange_ts: i.capture.exchange_ts, request_start_utc: i.capture.request_start_utc, rtt_ms: i.capture.rtt_ms,
    server_requestTime: i.capture.server_requestTime, clock_offset_ms: i.capture.clock_offset_ms,
    evaluated_at_utc: i.now.toISOString(), session, intent: i.intent, ceilingBps: i.ceilingBps,
    feeScenariosBps: i.userFeeBps !== undefined ? [...DEFAULT_FEE_SCENARIOS_BPS, i.userFeeBps] : DEFAULT_FEE_SCENARIOS_BPS, gate, outputs,
  };
  r.receipt_sha256 = sha256(canonicalJson({ ...r, receipt_sha256: undefined }));
  return r;
}

export function sound(i: SoundingInput): SoundingResult {
  const cap = i.capture;
  if (rawHash(cap.raw) !== cap.raw_sha256) throw new Error("capture hash mismatch");
  const sess = classifySession(i.now, i.states, i.calendar);
  const freshness = {
    exchangeAgeMs: i.historical ? undefined : i.now.getTime() - Number(cap.exchange_ts),
    rttMs: cap.rtt_ms, clockOffsetMs: cap.clock_offset_ms, historical: i.historical,
  };
  const base = { symbol: cap.symbol, session: sess.state, sessionDetail: sess.detail, intent: i.intent, ceilingBps: i.ceilingBps, freshness };
  const fail = (gate: NonNullable<SoundingResult["gate"]>, gateDetail: string, extra: Partial<SoundingResult> = {}): SoundingResult =>
    ({ ok: false, gate, gateDetail, ...base, ...extra, receipt: receiptFor(i, sess.state, gate, { gateDetail }) });

  // Gate 1: instrument
  const elig = eligibilityFor(cap.symbol, i.stockInfo);
  if (!elig.known) return fail("INVALID_INSTRUMENT", "symbol not present in Bitget Reality stock-info");
  // Gate 2: session
  if (sess.state === "unknown") return fail("SESSION_UNKNOWN", sess.detail, { weekendTradable: elig.weekendTradable });
  // Gate 3: weekend eligibility
  if ((sess.state === "weekend_mm" || sess.state === "holiday_mm") && !elig.weekendTradable)
    return fail("UNAVAILABLE_THIS_SESSION", "weekendTradable=no for this instrument; a visible quote does not make it available in this session", { weekendTradable: false });
  // Gate 4: book validity
  const v = validateBook(cap.raw);
  if (!v.valid) return fail(v.code, v.detail, { weekendTradable: elig.weekendTradable });
  // Gate 5: freshness (live only)
  if (!i.historical) {
    if (cap.clock_offset_ms === undefined || Math.abs(cap.clock_offset_ms) > FRESHNESS.maxClockOffsetMs)
      return fail("FRESHNESS_UNKNOWN", "clock offset unmeasured or too large", { weekendTradable: elig.weekendTradable });
    if (freshness.exchangeAgeMs! > FRESHNESS.maxExchangeAgeMs || freshness.exchangeAgeMs! < -FRESHNESS.maxClockOffsetMs || cap.rtt_ms > FRESHNESS.maxRttMs)
      return fail("FRESHNESS_UNKNOWN", `exchange age ${freshness.exchangeAgeMs} ms, rtt ${cap.rtt_ms} ms`, { weekendTradable: elig.weekendTradable });
  }
  // Cost, one leg
  const leg: LegCost = i.intent.side === "buy" ? buyWithBudget(cap.raw, i.intent.quoteBudget, v.mid) : sellShares(cap.raw, i.intent.baseQty, v.mid);
  if (leg.status === "OK" && i.minNotionalUsdt && D(leg.cash).lt(i.minNotionalUsdt))
    return fail("INVALID_INSTRUMENT", `notional ${leg.cash} below minimum ${i.minNotionalUsdt}`, { weekendTradable: elig.weekendTradable });
  // Gate 6: stability
  if (i.previousBpsPreFee !== undefined && leg.status === "OK" && D(leg.bpsPreFee!).minus(i.previousBpsPreFee).abs().gt(STABILITY_BPS))
    return fail("UNSTABLE_QUOTE", `cost moved ${D(leg.bpsPreFee!).minus(i.previousBpsPreFee).toFixed(2)} bps between snapshots`, { weekendTradable: elig.weekendTradable, referenceMid: v.mid.toString(), leg });

  const scenarios = i.userFeeBps !== undefined ? [...DEFAULT_FEE_SCENARIOS_BPS.map((f) => ({ feeBps: f, source: "scenario" as const })), { feeBps: i.userFeeBps, source: "user" as const }] : DEFAULT_FEE_SCENARIOS_BPS.map((f) => ({ feeBps: f, source: "scenario" as const }));
  const fees: FeeScenario[] = scenarios.map((s) => {
    if (leg.status !== "OK") return { ...s, verdict: "INSUFFICIENT_VISIBLE_DEPTH" as CostVerdict };
    const allIn = D(leg.bpsPreFee!).plus(s.feeBps);
    return { ...s, allInBps: allIn.toFixed(2), verdict: allIn.lte(i.ceilingBps) ? "WITHIN_CEILING_ON_THIS_SNAPSHOT" : "OVER_CEILING_ON_THIS_SNAPSHOT" };
  });
  const verdictSet = new Set(fees.filter((f) => f.source === "scenario").map((f) => f.verdict));
  const feeSensitive = verdictSet.size > 1;

  const alternatives: Alternative[] = [];
  if (leg.status === "OK") {
    alternatives.push({ kind: "immediate_cross", qty: leg.qty, allInBpsByFee: Object.fromEntries(fees.map((f) => [f.feeBps, f.allInBps!])), tradeoffs: ["market or marketable-limit; Bitget UI offers both on weekends; acceptance and fill not promised", "conditional on this snapshot"] });
  }
  if (fees.some((f) => f.verdict !== "WITHIN_CEILING_ON_THIS_SNAPSHOT")) {
    const worstFee = Math.max(...scenarios.map((s) => s.feeBps));
    const q = i.intent.side === "sell" ? largestSellWithin(cap.raw, v.mid, i.ceilingBps, worstFee) : largestBuyWithin(cap.raw, v.mid, i.ceilingBps, worstFee);
    if (q && q.gt(0)) alternatives.push({ kind: "largest_within_ceiling", qty: q.toString(), tradeoffs: [`largest ${i.intent.side === "sell" ? "share quantity" : "USDT budget"} within ceiling at the ${worstFee} bps fee scenario`, "partial exposure change"] });
  }
  const limitPx = i.intent.side === "sell" ? v.bestAsk : v.bestBid;
  alternatives.push({ kind: "resting_limit", price: limitPx.toString(), tradeoffs: ["hypothetical: cost only if filled", "no_fill_possible", ...(sess.state === "weekend_mm" || sess.state === "holiday_mm" ? ["cancel_at_session_switch (Bitget Stock 2.0 FAQ)", "band eligibility unverified"] : [])] });
  alternatives.push({ kind: "requote_at_switch", tradeoffs: [nextSwitchHint(sess), "nothing promised about future cost or availability"] });

  const outputs = { referenceMid: v.mid.toString(), leg, fees, feeSensitive, alternatives };
  return { ok: true, ...base, weekendTradable: elig.weekendTradable, referenceMid: v.mid.toString(), leg, fees, feeSensitive, alternatives, receipt: receiptFor(i, sess.state, undefined, outputs) };
}

export { buyWithBudget, sellShares, validateBook, rawHash } from "./book";
export { classifySession, nyClock } from "./session";
export type { SoundingResult, Intent, BookCapture } from "./types";
export { Decimal };
