import { describe, expect, it } from "vitest";
import { sound } from "..";
import { rawHash } from "../book";
import { lastLook, LastLookInputError, decidingRow, verifyReceipt } from "../lastlook";
import type { BookCapture } from "../types";
import { D } from "../types";
import { calendar, instruments, rhims, states, stockInfo, T_RHIMS } from "./helpers";

const ctx = () => ({ stockInfo: stockInfo(), states: states(), calendar: calendar(), instruments: instruments(), historical: true, now: T_RHIMS });
const order = { intent: { side: "sell" as const, baseQty: "178.4121" }, ceilingBps: 50, userFeeBps: 8 };
const read = (cap: BookCapture = rhims(), o = order) => sound({ ...ctx(), capture: cap, ...o });

/** Shift every bid by `bps` (negative = lower prices, worse for a seller) and re-hash, as a controlled later book. */
function shiftedBids(bps: number): BookCapture {
  const c = rhims();
  c.raw.data.bids = c.raw.data.bids.map(([p, q]) => [D(p).mul(D(1).plus(D(bps).div(10000))).toFixed(4), q]);
  c.raw_sha256 = rawHash(c.raw);
  return c;
}

describe("Last Look", () => {
  it("same book -> stands, zero drift, hash-linked to both receipts", () => {
    const o = read(), r = lastLook(o, read());
    expect(r.status).toBe("STANDS_ON_FRESH_BOOK");
    expect(r.driftBps).toBe("0.00");
    expect(r.decidingFeeBps).toBe(8);
    expect(r.original.receipt_sha256).toBe(o.receipt.receipt_sha256);
    expect(r.receipt_sha256).toHaveLength(64);
  });
  it("small move inside tolerance -> stands", () => {
    expect(lastLook(read(), read(shiftedBids(-2))).status).toBe("STANDS_ON_FRESH_BOOK");
  });
  it("price moves beyond tolerance while cost stays under the ceiling -> VOID_STALE (anomaly, either direction)", () => {
    const r = lastLook(read(), read(shiftedBids(-8)));
    expect(r.status).toBe("VOID_STALE");
    expect(Number(r.priceDriftBps)).toBeLessThan(-5);
    expect(r.reasons.join(" ")).toMatch(/price you would get moved against you/);
    expect(lastLook(read(), read(shiftedBids(+8))).reasons.join(" ")).toMatch(/in your favour/);
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
});
