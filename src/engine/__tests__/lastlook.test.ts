import { afterEach, describe, expect, it } from "vitest";
import { sound } from "..";
import { canonicalJson, rawHash, sha256 } from "../book";
import { lastLook, LastLookInputError, decidingRow, verifyReceipt, DEFAULT_LASTLOOK_TOLERANCE_BPS, MAX_DECISION_AGE_MS } from "../lastlook";
import type { BookCapture, Intent } from "../types";
import { D } from "../types";
import { calendar, instruments, rhims, states, stockInfo, T_RHIMS } from "./helpers";

const ctx = () => ({ stockInfo: stockInfo(), states: states(), calendar: calendar(), instruments: instruments(), historical: true, now: T_RHIMS });
const order: { intent: Intent; ceilingBps: number; userFeeBps: number } = { intent: { side: "sell", baseQty: "178.4121" }, ceilingBps: 50, userFeeBps: 8 };
const read = (cap: BookCapture = rhims(), o = order) => sound({ ...ctx(), capture: cap, ...o });

/** Shift every bid by `bps` (negative = lower prices, worse for a seller) and re-hash, as a controlled later book. */
function shiftedBids(bps: number): BookCapture {
  const c = rhims();
  c.raw.data.bids = c.raw.data.bids.map(([p, q]) => [D(p).mul(D(1).plus(D(bps).div(10000))).toFixed(4), q]);
  c.raw_sha256 = rawHash(c.raw);
  return c;
}

function shiftedAsks(bps: number): BookCapture {
  const c = rhims();
  c.raw.data.asks = c.raw.data.asks.map(([p, q]) => [D(p).mul(D(1).plus(D(bps).div(10000))).toFixed(4), q]);
  c.raw_sha256 = rawHash(c.raw);
  return c;
}

/** The same book, captured `ms` later. */
function later(ms: number, c: BookCapture = rhims()): BookCapture {
  c.exchange_ts = String(Number(c.exchange_ts) + ms);
  return c;
}

afterEach(() => { delete process.env.SOUNDING_RECEIPT_KEY; });

describe("Last Look", () => {
  it("uses the engine's stability threshold, not a separate number", () => {
    expect(DEFAULT_LASTLOOK_TOLERANCE_BPS).toBe(10);
    expect(lastLook(read(), read()).toleranceBps).toBe(10);
  });
  it("same book -> stands, zero drift, hash-linked to both receipts", () => {
    const o = read(), r = lastLook(o, read());
    expect(r.status).toBe("STANDS_ON_FRESH_BOOK");
    expect(r.driftBps).toBe("0.00");
    expect(r.decidingFeeBps).toBe(8);
    expect(r.original.receipt_sha256).toBe(o.receipt.receipt_sha256);
    expect(r.receipt_sha256).toHaveLength(64);
    expect(r.headroomBps).toBe((50 - Number(decidingRow(o)!.allInBps)).toFixed(2));
    expect(r.gapSeconds).toBe("0.0");
  });
  it("small move inside tolerance -> stands", () => {
    expect(lastLook(read(), read(shiftedBids(-2))).status).toBe("STANDS_ON_FRESH_BOOK");
    expect(lastLook(read(), read(shiftedBids(-8))).status).toBe("STANDS_ON_FRESH_BOOK");
  });
  it("price moves beyond tolerance while cost stays under the ceiling -> VOID_STALE (anomaly, either direction)", () => {
    const r = lastLook(read(), read(shiftedBids(-12)));
    expect(r.status).toBe("VOID_STALE");
    expect(Number(r.priceDriftBps)).toBeLessThan(-10);
    expect(r.reasons.join(" ")).toMatch(/price you would get moved against you/);
    expect(lastLook(read(), read(shiftedBids(+12))).reasons.join(" ")).toMatch(/in your favour/);
  });
  it("verdict flips over the ceiling -> VOID_STALE with the flip named", () => {
    const r = lastLook(read(), read(shiftedBids(-30)));
    expect(r.status).toBe("VOID_STALE");
    expect(r.reasons.join(" ")).toMatch(/verdict flipped/);
  });
  it("a gate fails on the fresh look -> VOID_GATE", () => {
    const fresh = sound({ ...ctx(), instruments: [], capture: rhims(), ...order });
    const r = lastLook(read(), fresh);
    expect(r.status).toBe("VOID_GATE");
    expect(r.reasons[0]).toMatch(/INVALID_INSTRUMENT/);
  });
  it("fresh book cannot cover the order -> VOID_STALE", () => {
    const c = rhims(); c.raw.data.bids = c.raw.data.bids.slice(0, 2); c.raw_sha256 = rawHash(c.raw);
    expect(lastLook(read(), read(c)).status).toBe("VOID_STALE");
  });
  it("refuses to confirm a tampered decision", () => {
    const o = read(); o.receipt.ceilingBps = 500;
    expect(verifyReceipt(o.receipt)).toBe(false);
    expect(() => lastLook(o, read())).toThrow(LastLookInputError);
  });
  it("ignores edited top-level numbers and uses only the hash-verified receipt", () => {
    const o = read(); o.leg = { ...o.leg!, bpsPreFeeExact: "-999", vwap: "1" }; o.fees = o.fees!.map((f) => ({ ...f, verdict: "WITHIN_CEILING_ON_THIS_SNAPSHOT" as const }));
    const r = lastLook(o, read());
    expect(r.status).toBe("STANDS_ON_FRESH_BOOK");
    expect(r.driftBps).toBe("0.00");
  });
  it("refuses to confirm a decision that was not within the ceiling under the deciding fee", () => {
    const noFee = read(rhims(), { ...order, userFeeBps: undefined as unknown as number });
    expect(decidingRow(noFee)!.feeBps).toBe(20); // unknown fee: the worst scenario decides
    expect(() => lastLook(noFee, noFee)).toThrow(/only a decision that was within/);
  });
  it("refuses a fresh sounding for a different order", () => {
    expect(() => lastLook(read(), read(rhims(), { ...order, intent: { side: "sell", baseQty: "35" } }))).toThrow(/different order/);
  });
  it("buy side: higher asks are against the buyer", () => {
    const buy = { intent: { side: "buy" as const, quoteBudget: "1000" }, ceilingBps: 50, userFeeBps: 8 };
    const o = read(rhims(), buy);
    expect(decidingRow(o)!.verdict).toBe("WITHIN_CEILING_ON_THIS_SNAPSHOT");
    expect(lastLook(o, read(shiftedAsks(+3), buy)).status).toBe("STANDS_ON_FRESH_BOOK");
    const r = lastLook(o, read(shiftedAsks(+12), buy));
    expect(r.status).toBe("VOID_STALE");
    expect(Number(r.priceDriftBps)).toBeLessThan(-10);
    expect(r.reasons.join(" ")).toMatch(/against you/);
  });
  it("a decision older than the limit is void even on an unchanged book", () => {
    expect(lastLook(read(), read(later(MAX_DECISION_AGE_MS))).status).toBe("STANDS_ON_FRESH_BOOK");
    const r = lastLook(read(), read(later(MAX_DECISION_AGE_MS + 1000)));
    expect(r.status).toBe("VOID_STALE");
    expect(r.reasons[0]).toMatch(/2.0 minutes before this confirm/);
    expect(lastLook(read(), read(later(13 * 86_400_000))).reasons[0]).toMatch(/13.0 days/);
  });
  it("refuses a confirming book older than the decision", () => {
    expect(() => lastLook(read(later(1000)), read())).toThrow(/older than the decision/);
  });
  it("signing deployment: a forged decision with a recomputed hash is refused", () => {
    process.env.SOUNDING_RECEIPT_KEY = "test-key";
    const o = read();
    expect(o.receipt.receipt_sig).toHaveLength(64);
    expect(verifyReceipt(o.receipt)).toBe(true);
    o.receipt.ceilingBps = 500;
    o.receipt.receipt_sha256 = sha256(canonicalJson({ ...o.receipt, receipt_sha256: undefined, receipt_sig: undefined }));
    expect(verifyReceipt(o.receipt)).toBe(false);
    expect(() => lastLook(o, read())).toThrow(LastLookInputError);
    const signed = read();
    process.env.SOUNDING_RECEIPT_KEY = "other-key";
    expect(verifyReceipt(signed.receipt)).toBe(false);
  });
  it("unsigned deployment: integrity only, so a recomputed hash passes (stated in the UI)", () => {
    const o = read();
    expect(o.receipt.receipt_sig).toBeUndefined();
    o.receipt.ceilingBps = 500;
    o.receipt.receipt_sha256 = sha256(canonicalJson({ ...o.receipt, receipt_sha256: undefined, receipt_sig: undefined }));
    expect(verifyReceipt(o.receipt)).toBe(true);
  });
});
