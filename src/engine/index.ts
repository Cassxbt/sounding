import Decimal from "decimal.js";
import { allInBps } from "./cost";
import { buyWithBudget, canonicalJson, signReceiptHash, decimals, largestBuyWithin, largestSellWithin, rawHash, sellShares, sha256, validateBook, withinCeiling } from "./book";
import { eligibilityFor, type StockInfo } from "./eligibility";
import { classifySession, nextSessionNy, nextSwitchHint, type Calendar, type MarketStates } from "./session";
import type { Alternative, BookCapture, CostVerdict, FeeScenario, InstrumentSpec, Intent, LegCost, Receipt, SoundingResult } from "./types";
import { D } from "./types";

export const ENGINE_VERSION = "sounding-engine/0.6.0";
import { DEFAULT_FEE_SCENARIOS_BPS } from "./fees";
export { DEFAULT_FEE_SCENARIOS_BPS, FEE_SCENARIO_SOURCES } from "./fees";
export const FRESHNESS = { maxExchangeAgeMs: 5000, maxRttMs: 2000, maxClockOffsetMs: 2000 };
import { STABILITY_BPS } from "./decision";
export { STABILITY_BPS };

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
  /** exchange order constraints (GET /api/v3/market/instruments); required */
  instruments: InstrumentSpec[] | null;
}

function receiptFor(i: SoundingInput, session: SoundingResult["session"], gate: Receipt["gate"], outputs: unknown): Receipt {
  const r: Receipt = {
    engineVersion: ENGINE_VERSION, historical: i.historical, symbol: i.capture.symbol, source: i.capture.source, raw_sha256: i.capture.raw_sha256,
    exchange_ts: i.capture.exchange_ts, request_start_utc: i.capture.request_start_utc, rtt_ms: i.capture.rtt_ms,
    server_requestTime: i.capture.server_requestTime, clock_offset_ms: i.capture.clock_offset_ms,
    evaluated_at_utc: i.now.toISOString(), session, intent: i.intent, ceilingBps: i.ceilingBps,
    feeScenariosBps: i.userFeeBps !== undefined ? [...DEFAULT_FEE_SCENARIOS_BPS, i.userFeeBps] : DEFAULT_FEE_SCENARIOS_BPS, gate, outputs,
    metadata: { stockInfo: i.stockInfo?.find((s) => s.symbol === i.capture.symbol) ?? null, instrument: i.instruments?.find((s) => s.symbol === i.capture.symbol) ?? null },
    metadata_sha256: "",
  };
  r.metadata_sha256 = sha256(canonicalJson({ ...r.metadata, states: i.states ?? null, calendar: i.calendar ?? null }));
  r.receipt_sha256 = sha256(canonicalJson({ ...r, receipt_sha256: undefined, receipt_sig: undefined }));
  r.receipt_sig = signReceiptHash(r.receipt_sha256);
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
  // Gate 2b: venue. In US sessions Bitget routes rToken orders to NASDAQ/NYSE, so its own book is not where the order
  // fills; only on weekends and US holidays does Bitget match on that book.
  if (sess.state !== "weekend_mm" && sess.state !== "holiday_mm")
    return fail("ROUTED_TO_US_MARKET", `${sess.state.replace("_", "-")} session: Bitget routes rToken orders to the US market (NASDAQ/NYSE, per Bitget) in US sessions; Sounding prices orders where Bitget's own book is the market (weekends and US holidays)`, { weekendTradable: elig.weekendTradable });
  // Gate 3: weekend eligibility
  if ((sess.state === "weekend_mm" || sess.state === "holiday_mm") && !elig.weekendTradable)
    return fail("UNAVAILABLE_THIS_SESSION", "weekendTradable=no for this instrument; a visible quote does not make it available in this session", { weekendTradable: false });
  // Gate 3b: exchange order constraints (after eligibility, so an ineligible name is refused for that reason). A size the exchange would not accept is refused with a valid suggestion, never silently floored.
  const spec = i.instruments?.find((x) => x.symbol === cap.symbol);
  if (!spec) return fail("INVALID_INSTRUMENT", "instrument order constraints unavailable (GET /api/v3/market/instruments)");
  if (spec.status !== "online") return fail("INVALID_INSTRUMENT", `instrument status ${spec.status}`, { spec });
  const qtyDp = Number(spec.quantityPrecision), quoteDp = Number(spec.quotePrecision);
  if (i.intent.side === "sell") {
    const q = D(i.intent.baseQty);
    if (!q.isFinite() || q.lte(0)) return fail("INVALID_QUANTITY_PRECISION", "quantity must be a positive number", { spec });
    if (decimals(i.intent.baseQty) > qtyDp) {
      const s = q.toDecimalPlaces(qtyDp, Decimal.ROUND_DOWN).toString();
      return fail("INVALID_QUANTITY_PRECISION", `${cap.symbol} accepts ${qtyDp} decimal places; ${i.intent.baseQty} has ${decimals(i.intent.baseQty)}`, { spec, suggestion: { baseQty: s, reason: `floored to ${qtyDp} dp; re-run to price it` } });
    }
    if (q.lt(spec.minOrderQty)) return fail("BELOW_MIN_ORDER", `quantity below minimum ${spec.minOrderQty}`, { spec });
  } else {
    const b = D(i.intent.quoteBudget);
    if (!b.isFinite() || b.lte(0)) return fail("INVALID_QUANTITY_PRECISION", "budget must be a positive number", { spec });
    if (decimals(i.intent.quoteBudget) > quoteDp) {
      const s = b.toDecimalPlaces(quoteDp, Decimal.ROUND_DOWN).toString();
      return fail("INVALID_QUANTITY_PRECISION", `${cap.symbol} quote precision is ${quoteDp} dp`, { spec, suggestion: { quoteBudget: s, reason: `floored to ${quoteDp} dp; re-run to price it` } });
    }
    if (b.lt(spec.minOrderAmount)) return fail("BELOW_MIN_ORDER", `budget below minimum order amount ${spec.minOrderAmount} USDT`, { spec, suggestion: { quoteBudget: spec.minOrderAmount, reason: "minimum order amount" } });
  }
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
  if (leg.status === "OK" && D(leg.cashExact ?? leg.cash).lt(spec.minOrderAmount))
    return fail("BELOW_MIN_ORDER", `order value ${D(leg.cashExact ?? leg.cash).toDecimalPlaces(6).toString()} USDT below minimum order amount ${spec.minOrderAmount} USDT`, { weekendTradable: elig.weekendTradable, spec });
  // Gate 6: stability
  if (i.previousBpsPreFee !== undefined && leg.status === "OK" && D(leg.bpsPreFeeExact!).minus(i.previousBpsPreFee).abs().gt(STABILITY_BPS))
    return fail("UNSTABLE_QUOTE", `cost moved ${D(leg.bpsPreFeeExact!).minus(i.previousBpsPreFee).toFixed(2)} bps between snapshots`, { weekendTradable: elig.weekendTradable, referenceMid: v.mid.toString(), leg });

  const scenarios = i.userFeeBps !== undefined ? [...DEFAULT_FEE_SCENARIOS_BPS.map((f) => ({ feeBps: f, source: "scenario" as const })), { feeBps: i.userFeeBps, source: "user" as const }] : DEFAULT_FEE_SCENARIOS_BPS.map((f) => ({ feeBps: f, source: "scenario" as const }));
  const fees: FeeScenario[] = scenarios.map((s) => {
    if (leg.status !== "OK") return { ...s, verdict: "INSUFFICIENT_VISIBLE_DEPTH" as CostVerdict };
    const allIn = allInBps(leg, s.feeBps);
    return { ...s, allInBps: allIn.toFixed(2), verdict: withinCeiling(leg, s.feeBps, i.ceilingBps) ? "WITHIN_CEILING_ON_THIS_SNAPSHOT" : "OVER_CEILING_ON_THIS_SNAPSHOT" };
  });
  // Once the trader states their fee, that fee decides; the scenarios stay visible as context only.
  const verdictSet = new Set(fees.filter((f) => f.source === "scenario").map((f) => f.verdict));
  const userFeeRow = fees.find((f) => f.source === "user");
  const feeSensitive = !userFeeRow && verdictSet.size > 1;
  const decidingVerdicts = userFeeRow ? [userFeeRow] : fees;

  const alternatives: Alternative[] = [];
  if (leg.status === "OK") {
    alternatives.push({ kind: "immediate_cross", qty: leg.qty, allInBpsByFee: Object.fromEntries(fees.map((f) => [f.feeBps, f.allInBps!])), tradeoffs: [`a limit IOC at ${leg.deepestPrice}, the deepest price walked: nothing fills past it, and what cannot fill at once is cancelled; acceptance and fill not promised`, "conditional on this snapshot"] });
  }
  if (decidingVerdicts.some((f) => f.verdict !== "WITHIN_CEILING_ON_THIS_SNAPSHOT")) {
    const worstFee = i.userFeeBps !== undefined ? i.userFeeBps : Math.max(...scenarios.map((s) => s.feeBps));
    const q = i.intent.side === "sell"
      ? largestSellWithin(cap.raw, v.mid, i.ceilingBps, worstFee, qtyDp, D(spec.minOrderAmount))
      : largestBuyWithin(cap.raw, v.mid, i.ceilingBps, worstFee, quoteDp, D(spec.minOrderAmount));
    if (q && q.gt(0)) {
      const clip = i.intent.side === "sell" ? sellShares(cap.raw, q.toString(), v.mid) : buyWithBudget(cap.raw, q.toString(), v.mid);
      const unit = i.intent.side === "sell" ? "sh" : "USDT";
      const remainder = D(i.intent.side === "sell" ? i.intent.baseQty : i.intent.quoteBudget).minus(q);
      const remainderValue = i.intent.side === "sell" ? remainder.mul(v.mid) : remainder;
      const orphan = remainder.gt(0) && remainderValue.lt(spec.minOrderAmount);
      alternatives.push({
        kind: "largest_within_ceiling", qty: q.toString(), remainder: remainder.toString(),
        allInBpsByFee: { [worstFee]: allInBps(clip, worstFee).toFixed(2) },
        tradeoffs: [`priced now: largest ${i.intent.side === "sell" ? "share quantity" : "USDT budget"} within ceiling at ${i.userFeeBps !== undefined ? `your ${worstFee} bps fee` : `the ${worstFee} bps fee scenario`}`, `remainder ${remainder.toString()} ${unit} unpriced: no forecast of later depth`, ...(orphan ? [`remainder is below the ${spec.minOrderAmount} USDT minimum order: it cannot be traded on its own`] : []), i.intent.side === "sell" ? "does not make you flat" : "does not spend your full budget"],
      });
    }
  }
  // Personalization made visible: the same book at the worst fee scenario, sized to the ceiling there.
  let worstCase: SoundingResult["worstCase"];
  const worstRow = fees.filter((f) => f.source === "scenario").sort((a, b) => b.feeBps - a.feeBps)[0];
  if (userFeeRow?.verdict === "WITHIN_CEILING_ON_THIS_SNAPSHOT" && worstRow && worstRow.verdict === "OVER_CEILING_ON_THIS_SNAPSHOT") {
    const q = i.intent.side === "sell"
      ? largestSellWithin(cap.raw, v.mid, i.ceilingBps, worstRow.feeBps, qtyDp, D(spec.minOrderAmount))
      : largestBuyWithin(cap.raw, v.mid, i.ceilingBps, worstRow.feeBps, quoteDp, D(spec.minOrderAmount));
    const full = D(i.intent.side === "sell" ? i.intent.baseQty : i.intent.quoteBudget);
    worstCase = { feeBps: worstRow.feeBps, allInBps: worstRow.allInBps!, verdict: worstRow.verdict, ...(q && q.gt(0) ? { clipQty: q.toString(), remainder: full.minus(q).toString() } : {}) };
  }
  const limitPx = i.intent.side === "sell" ? v.bestAsk : v.bestBid;
  alternatives.push({ kind: "resting_limit", price: limitPx.toString(), tradeoffs: ["hypothetical: cost only if filled", "no_fill_possible", ...(sess.state === "weekend_mm" || sess.state === "holiday_mm" ? ["cancel_at_session_switch (Bitget Stock 2.0 FAQ)", "band eligibility unverified"] : [])] });
  alternatives.push({ kind: "requote_at_switch", tradeoffs: [nextSwitchHint(sess), "reassess only: does not by itself satisfy a hard exit", "nothing promised about future cost or availability"] });

  const nextSession = nextSessionNy(sess, i.calendar);
  const outputs = { referenceMid: v.mid.toString(), leg, fees, feeSensitive, alternatives, nextSessionNy: nextSession, ...(worstCase ? { worstCase } : {}) };
  return { ok: true, ...base, spec, weekendTradable: elig.weekendTradable, referenceMid: v.mid.toString(), leg, fees, feeSensitive, alternatives, worstCase, nextSessionNy: nextSession, receipt: receiptFor(i, sess.state, undefined, outputs) };
}

export { buyWithBudget, sellShares, validateBook, rawHash } from "./book";
export type { InstrumentSpec } from "./types";
export { classifySession, nyClock } from "./session";
export type { SoundingResult, Intent, BookCapture } from "./types";
export { Decimal };
