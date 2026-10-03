import Decimal from "decimal.js";

export type Level = [price: string, qty: string];

export interface RawOrderbook {
  code: string;
  msg: string;
  requestTime: number;
  data: { asks: Level[]; bids: Level[]; ts: string };
}

export interface BookCapture {
  symbol: string;
  raw: RawOrderbook;
  raw_sha256: string;
  request_start_utc: string;
  rtt_ms: number;
  exchange_ts: string;
  server_requestTime?: number;
  /** measured local-clock minus server-clock offset, ms; undefined = unmeasured */
  clock_offset_ms?: number;
  source: string;
}

export type Side = "buy" | "sell";

/** Typed order intent. "Sell 5,000 USDT of X" is not representable on purpose. */
export type Intent =
  | { side: "buy"; quoteBudget: string }
  | { side: "sell"; baseQty: string };

export type SessionState =
  | "regular"
  | "pre_market"
  | "after_hours"
  | "overnight"
  | "weekend_mm"
  | "holiday_mm"
  | "unknown";

export type GateCode =
  | "INVALID_INSTRUMENT"
  | "SESSION_UNKNOWN"
  | "UNAVAILABLE_THIS_SESSION"
  | "INVALID_BOOK"
  | "NO_EXECUTABLE_QUOTE"
  | "FRESHNESS_UNKNOWN"
  | "UNSTABLE_QUOTE"
  | "INVALID_QUANTITY_PRECISION"
  | "BELOW_MIN_ORDER";

/** Exchange order constraints for one symbol, from GET /api/v3/market/instruments. */
export interface InstrumentSpec {
  symbol: string;
  quantityPrecision: string;
  pricePrecision: string;
  quotePrecision: string;
  minOrderQty: string;
  minOrderAmount: string;
  maxMarketOrderAmount?: string;
  status: string;
  isReality?: string;
}

export type CostVerdict =
  | "WITHIN_CEILING_ON_THIS_SNAPSHOT"
  | "OVER_CEILING_ON_THIS_SNAPSHOT"
  | "INSUFFICIENT_VISIBLE_DEPTH";

export interface LegCost {
  status: "OK" | "INSUFFICIENT_VISIBLE_DEPTH";
  /** base shares */
  qty: string;
  /** quote cash: spend for buy, proceeds for sell (pre-fee) */
  cash: string;
  vwap?: string;
  /** one-leg cost vs reference mid, pre-fee, basis points, rounded for display */
  bpsPreFee?: string;
  /** same cost at full precision; every ceiling comparison uses this, never the display value */
  bpsPreFeeExact?: string;
  levelsConsumed: number;
  /** visible quote notional on the consumed side */
  visibleNotional: string;
  thinTop: boolean;
}

export interface FeeScenario {
  feeBps: number;
  source: "scenario" | "user";
  allInBps?: string;
  verdict: CostVerdict;
}

export interface Alternative {
  kind:
    | "immediate_cross"
    | "largest_within_ceiling"
    | "resting_limit"
    | "requote_at_switch";
  qty?: string;
  price?: string;
  allInBpsByFee?: Record<number, string>;
  /** largest_within_ceiling: what the clip leaves, in the order's unit; never priced (no forecast of later depth) */
  remainder?: string;
  tradeoffs: string[];
}

export interface SoundingResult {
  ok: boolean;
  gate?: GateCode;
  gateDetail?: string;
  symbol: string;
  session: SessionState;
  sessionDetail: string;
  weekendTradable?: boolean;
  intent: Intent;
  ceilingBps: number;
  /** a valid size to use instead, when a precision or minimum gate refused the order */
  suggestion?: { baseQty?: string; quoteBudget?: string; reason: string };
  spec?: InstrumentSpec;
  referenceMid?: string;
  leg?: LegCost;
  fees?: FeeScenario[];
  feeSensitive?: boolean;
  alternatives?: Alternative[];
  /** NY date of the next session a re-quote could use; see nextSessionNy */
  nextSessionNy?: string | null;
  freshness: {
    exchangeAgeMs?: number;
    rttMs: number;
    clockOffsetMs?: number;
    historical: boolean;
  };
  receipt: Receipt;
}

export interface Receipt {
  engineVersion: string;
  /** recorded-fixture evaluation (true) or a live book (false) */
  historical: boolean;
  symbol: string;
  source: string;
  raw_sha256: string;
  exchange_ts: string;
  request_start_utc: string;
  rtt_ms: number;
  server_requestTime?: number;
  clock_offset_ms?: number;
  evaluated_at_utc: string;
  session: SessionState;
  intent: Intent;
  ceilingBps: number;
  feeScenariosBps: number[];
  gate?: GateCode;
  outputs: unknown;
  /** sha256 of the canonical JSON of every field above */
  receipt_sha256?: string;
  /** HMAC-SHA256 of receipt_sha256 under the server's key; absent on unsigned (local) deployments */
  receipt_sig?: string;
}

export const D = (v: string | number | Decimal) => new Decimal(v);
