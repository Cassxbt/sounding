import { describe, expect, it } from "vitest";
import { allInBps } from "../cost";
import { sound, rawHash, validateBook, buyWithBudget, sellShares } from "..";
import { D } from "../types";
import { calendar, instruments, rhims, rspmo, rspy, states, stockInfo, T_RHIMS } from "./helpers";

const ctx = () => ({ stockInfo: stockInfo(), states: states(), calendar: calendar(), instruments: instruments(), historical: true, now: T_RHIMS });

describe("fixture integrity", () => {
  it("rHIMS raw hash matches the frozen census hash", () => {
    const fx = rhims();
    expect(rawHash(fx.raw)).toBe("51c18dc6b2926c4f65acc545686b03d5b548eac7fe33a3c139c0a8b50a8a2b2a");
    expect(fx.raw_sha256).toBe(rawHash(fx.raw));
  });
});

describe("rHIMS sell-side costs (independently replayed numbers)", () => {
  const mid = () => { const v = validateBook(rhims().raw); if (!v.valid) throw new Error(); return v.mid; };
  it.each([
    ["178.4121", "31.89", "4984.05"],
    ["35", "14.41", "979.46"],
    ["42", "14.68", "1175.32"],
    ["12", "12.49", "335.88"],
  ])("sell %s rHIMS -> %s bps pre-fee, proceeds %s", (qty, bps, proceeds) => {
    const r = sellShares(rhims().raw, qty, mid());
    expect(r.status).toBe("OK");
    expect(r.bpsPreFee).toBe(bps);
    expect(r.cash).toBe(proceeds);
  });
  it("mid is 28.025", () => expect(mid().toString()).toBe("28.025"));
});

describe("lead demo: fee-sensitive verdict then size flip", () => {
  it("178.4121 sh, ceiling 40 -> WITHIN at 5, OVER at 10, FEE_SENSITIVE", () => {
    const r = sound({ ...ctx(), capture: rhims(), intent: { side: "sell", baseQty: "178.4121" }, ceilingBps: 40 });
    expect(r.ok).toBe(true);
    expect(r.session).toBe("weekend_mm");
    expect(r.weekendTradable).toBe(true);
    expect(r.fees!.map((f) => [f.feeBps, f.allInBps, f.verdict])).toEqual([
      [5, "36.87", "WITHIN_CEILING_ON_THIS_SNAPSHOT"],
      [10, "41.86", "OVER_CEILING_ON_THIS_SNAPSHOT"],
    ]);
    expect(r.feeSensitive).toBe(true);
    const kinds = r.alternatives!.map((a) => a.kind);
    expect(kinds).toEqual(["immediate_cross", "largest_within_ceiling", "resting_limit", "requote_at_switch"]);
    const largest = r.alternatives!.find((a) => a.kind === "largest_within_ceiling")!;
    // largest within 40 bps at the 10 bps fee scenario must itself be within, and smaller than the request
    const chk = sellShares(rhims().raw, largest.qty!, D("28.025"));
    expect(largest.qty).toBe("148.2644"); // the largest at RHIMS quantityPrecision=4, with the fee taken from proceeds
    expect(allInBps(chk, 10).lte(40)).toBe(true);
    expect(allInBps(sellShares(rhims().raw, D(largest.qty!).plus("0.0001").toString(), D("28.025")), 10).gt(40)).toBe(true);
    expect(r.alternatives!.find((a) => a.kind === "resting_limit")!.tradeoffs).toContain("cancel_at_session_switch (Bitget Stock 2.0 FAQ)");
    expect(r.receipt.receipt_sha256).toHaveLength(64);
    expect(r.receipt.raw_sha256).toBe(rhims().raw_sha256);
  });
  it("35 sh -> WITHIN at all scenarios, not fee-sensitive", () => {
    const r = sound({ ...ctx(), capture: rhims(), intent: { side: "sell", baseQty: "35" }, ceilingBps: 50 });
    expect(r.fees!.every((f) => f.verdict === "WITHIN_CEILING_ON_THIS_SNAPSHOT")).toBe(true);
    expect(r.feeSensitive).toBe(false);
    expect(r.alternatives!.map((a) => a.kind)).not.toContain("largest_within_ceiling");
  });
  it("a stated fee decides: not fee-sensitive, no partial-size alternative when it fits", () => {
    const r = sound({ ...ctx(), capture: rhims(), intent: { side: "sell", baseQty: "178.4121" }, ceilingBps: 50, userFeeBps: 8 });
    expect(r.feeSensitive).toBe(false);
    expect(r.alternatives!.map((a) => a.kind)).not.toContain("largest_within_ceiling");
  });
  it("a stated fee that breaches the ceiling sizes the partial at that fee, not at a scenario", () => {
    const r = sound({ ...ctx(), capture: rhims(), intent: { side: "sell", baseQty: "178.4121" }, ceilingBps: 37, userFeeBps: 8 });
    const largest = r.alternatives!.find((a) => a.kind === "largest_within_ceiling")!;
    expect(largest.tradeoffs[0]).toMatch(/your 8 bps fee/);
    const chk = sellShares(rhims().raw, largest.qty!, D("28.025"));
    expect(allInBps(chk, 8).lte(37)).toBe(true);
    expect(largest.qty).toBe("135.8368");
  });
  it("a stated fee is added as its own labeled row", () => {
    const r = sound({ ...ctx(), capture: rhims(), intent: { side: "sell", baseQty: "178.4121" }, ceilingBps: 50, userFeeBps: 8 });
    const u = r.fees!.find((f) => f.source === "user")!;
    expect(u.feeBps).toBe(8); expect(u.allInBps).toBe("39.86"); expect(u.verdict).toBe("WITHIN_CEILING_ON_THIS_SNAPSHOT");
  });
});

describe("typed intents", () => {
  it("buy with quote budget spends at most the budget and reports shares", () => {
    const v = validateBook(rspy().raw); if (!v.valid) throw new Error();
    const r = buyWithBudget(rspy().raw, "1000", v.mid);
    expect(r.status).toBe("OK");
    expect(D(r.cash).lte(1000)).toBe(true);
    expect(D(r.qty).gt(0)).toBe(true);
    expect(D(r.bpsPreFee!).gt(0)).toBe(true);
  });
  it("RSPY $1k buy hits the thin top (small pin at best ask)", () => {
    const v = validateBook(rspy().raw); if (!v.valid) throw new Error();
    expect(buyWithBudget(rspy().raw, "1000", v.mid).thinTop).toBe(true);
    expect(buyWithBudget(rspy().raw, "100", v.mid).thinTop).toBe(false); // $100 is covered by the first level
  });
  it("RSPMO $25k buy is INSUFFICIENT_VISIBLE_DEPTH, never a partial-fill VWAP", () => {
    const r = sound({ ...ctx(), capture: rspmo(), intent: { side: "buy", quoteBudget: "25000" }, ceilingBps: 50 });
    expect(r.ok).toBe(true);
    expect(r.leg!.status).toBe("INSUFFICIENT_VISIBLE_DEPTH");
    expect(r.leg!.bpsPreFee).toBeUndefined();
    expect(r.fees!.every((f) => f.verdict === "INSUFFICIENT_VISIBLE_DEPTH")).toBe(true);
  });
});

describe("gates", () => {
  it("quoted but weekendTradable=no -> UNAVAILABLE_THIS_SESSION on a Sunday", () => {
    const fx = { ...rhims(), symbol: "RCVCOUSDT" }; // CVCO is weekendTradable=no in the frozen stock-info
    const r = sound({ ...ctx(), capture: fx, intent: { side: "sell", baseQty: "1" }, ceilingBps: 50 });
    expect(r.ok).toBe(false); expect(r.gate).toBe("UNAVAILABLE_THIS_SESSION"); expect(r.weekendTradable).toBe(false);
  });
  it.each([
    ["regular, Monday 10:00 NY", "2026-09-21T14:00:00Z"],
    ["overnight, Tuesday 22:00 NY", "2026-09-23T02:00:00Z"],
    ["pre-market, Monday 05:00 NY", "2026-09-21T09:00:00Z"],
  ])("%s -> ROUTED_TO_US_MARKET: the order goes to the US venue, not the book Sounding walks", (_, iso) => {
    const r = sound({ ...ctx(), now: new Date(iso), capture: rhims(), intent: { side: "sell", baseQty: "1" }, ceilingBps: 50 });
    expect(r.ok).toBe(false); expect(r.gate).toBe("ROUTED_TO_US_MARKET"); expect(r.gateDetail).toMatch(/NASDAQ\/NYSE/);
    expect(r.fees).toBeUndefined();
  });
  it("Labor Day (calendar closure on a Monday) is Bitget's own book: priced", () => {
    const r = sound({ ...ctx(), now: new Date("2026-09-07T14:00:00Z"), capture: rhims(), intent: { side: "sell", baseQty: "1" }, ceilingBps: 50 });
    expect(r.session).toBe("holiday_mm"); expect(r.ok).toBe(true);
  });
  it("unknown symbol -> INVALID_INSTRUMENT", () => {
    const r = sound({ ...ctx(), capture: { ...rhims(), symbol: "RNOPEUSDT" }, intent: { side: "sell", baseQty: "1" }, ceilingBps: 50 });
    expect(r.gate).toBe("INVALID_INSTRUMENT");
  });
  it("missing states/calendar -> SESSION_UNKNOWN", () => {
    const r = sound({ ...ctx(), states: null, capture: rhims(), intent: { side: "sell", baseQty: "1" }, ceilingBps: 50 });
    expect(r.gate).toBe("SESSION_UNKNOWN");
  });
  it("crossed book -> INVALID_BOOK; empty -> NO_EXECUTABLE_QUOTE (hash recomputed for the mutated raw)", () => {
    const crossed = rhims(); crossed.raw.data.bids[0][0] = "99"; crossed.raw_sha256 = rawHash(crossed.raw);
    expect(sound({ ...ctx(), capture: crossed, intent: { side: "sell", baseQty: "1" }, ceilingBps: 50 }).gate).toBe("INVALID_BOOK");
    const empty = rhims(); empty.raw.data.asks = []; empty.raw.data.bids = []; empty.raw_sha256 = rawHash(empty.raw);
    expect(sound({ ...ctx(), capture: empty, intent: { side: "sell", baseQty: "1" }, ceilingBps: 50 }).gate).toBe("NO_EXECUTABLE_QUOTE");
  });
  it("live mode: stale exchange ts or unmeasured clock -> FRESHNESS_UNKNOWN", () => {
    const later = new Date(T_RHIMS.getTime() + 60_000);
    const stale = sound({ ...ctx(), historical: false, now: later, capture: { ...rhims(), clock_offset_ms: 10 }, intent: { side: "sell", baseQty: "1" }, ceilingBps: 50 });
    expect(stale.gate).toBe("FRESHNESS_UNKNOWN");
    const unmeasured = sound({ ...ctx(), historical: false, now: new Date(T_RHIMS.getTime() + 100), capture: rhims(), intent: { side: "sell", baseQty: "1" }, ceilingBps: 50 });
    expect(unmeasured.gate).toBe("FRESHNESS_UNKNOWN");
    const fresh = sound({ ...ctx(), historical: false, now: new Date(T_RHIMS.getTime() + 100), capture: { ...rhims(), clock_offset_ms: 10 }, intent: { side: "sell", baseQty: "1" }, ceilingBps: 50 });
    expect(fresh.ok).toBe(true);
  });
  it("stability: >10 bps move between snapshots -> UNSTABLE_QUOTE", () => {
    const r = sound({ ...ctx(), capture: rhims(), intent: { side: "sell", baseQty: "178.4121" }, ceilingBps: 50, previousBpsPreFee: "10.00" });
    expect(r.gate).toBe("UNSTABLE_QUOTE");
  });
  it("tampered raw -> throws (hash mismatch)", () => {
    const t = rhims(); t.raw.data.bids[0][1] = "999";
    expect(() => sound({ ...ctx(), capture: t, intent: { side: "sell", baseQty: "1" }, ceilingBps: 50 })).toThrow(/hash/);
  });
});

describe("exchange constraints and exact ceiling comparisons (2026-09-23 cross-check)", () => {
  it("6-dp quantity on a 4-dp symbol is refused with a valid suggestion, never silently floored", () => {
    const r = sound({ ...ctx(), capture: rhims(), intent: { side: "sell", baseQty: "178.412132" }, ceilingBps: 50 });
    expect(r.ok).toBe(false);
    expect(r.gate).toBe("INVALID_QUANTITY_PRECISION");
    expect(r.suggestion?.baseQty).toBe("178.4121");
    expect(r.leg).toBeUndefined();
  });
  it("order value below minOrderAmount is refused", () => {
    const r = sound({ ...ctx(), capture: rhims(), intent: { side: "sell", baseQty: "0.2" }, ceilingBps: 50 });
    expect(r.gate).toBe("BELOW_MIN_ORDER");
    const b = sound({ ...ctx(), capture: rspy(), intent: { side: "buy", quoteBudget: "5" }, ceilingBps: 50 });
    expect(b.gate).toBe("BELOW_MIN_ORDER"); expect(b.suggestion?.quoteBudget).toBe("10");
  });
  it("negative or non-numeric sizes are refused", () => {
    expect(sound({ ...ctx(), capture: rhims(), intent: { side: "sell", baseQty: "-5" }, ceilingBps: 50 }).gate).toBe("INVALID_QUANTITY_PRECISION");
  });
  it("missing instrument metadata refuses rather than guessing precision", () => {
    expect(sound({ ...ctx(), instruments: [], capture: rhims(), intent: { side: "sell", baseQty: "1" }, ceilingBps: 50 }).gate).toBe("INVALID_INSTRUMENT");
  });
  it("the verdict compares exact cost, not the 2-dp display (148.671 shows 50.00 but costs 50.0000037)", () => {
    const r = sound({ ...ctx(), capture: rhims(), intent: { side: "sell", baseQty: "148.671" }, ceilingBps: 50, userFeeBps: 20 });
    const at20 = r.fees!.find((f) => f.feeBps === 20)!;
    expect(at20.allInBps).toBe("50.00");
    expect(allInBps(r.leg!, 20).gt(50)).toBe(true);
    expect(at20.verdict).toBe("OVER_CEILING_ON_THIS_SNAPSHOT");
  });
  it("re-quote is labelled as reassess-only", () => {
    const r = sound({ ...ctx(), capture: rhims(), intent: { side: "sell", baseQty: "178.4121" }, ceilingBps: 50 });
    expect(r.alternatives!.find((a) => a.kind === "requote_at_switch")!.tradeoffs).toContain("reassess only: does not by itself satisfy a hard exit");
  });
});

describe("worst-fee contrast on the same book", () => {
  const ctx = () => ({ stockInfo: stockInfo(), states: states(), calendar: calendar(), instruments: instruments(), historical: true, now: T_RHIMS });
  it("within at your fee, over at the worst scenario: names the largest size that fits at the worst fee", () => {
    const r = sound({ ...ctx(), capture: rhims(), intent: { side: "sell", baseQty: "178.4121" }, ceilingBps: 40, userFeeBps: 5 });
    expect(r.worstCase).toMatchObject({ feeBps: 10, allInBps: "41.86", verdict: "OVER_CEILING_ON_THIS_SNAPSHOT", clipQty: "148.2644", remainder: "30.1477" });
    expect((r.receipt.outputs as { worstCase?: unknown }).worstCase).toEqual(r.worstCase);
  });
  it("no contrast when the worst scenario is also within, or when no fee is stated", () => {
    expect(sound({ ...ctx(), capture: rhims(), intent: { side: "sell", baseQty: "35" }, ceilingBps: 50, userFeeBps: 8 }).worstCase).toBeUndefined();
    expect(sound({ ...ctx(), capture: rhims(), intent: { side: "sell", baseQty: "178.4121" }, ceilingBps: 50 }).worstCase).toBeUndefined();
  });
});

describe("audit fixes in the engine", () => {
  const ctx = () => ({ stockInfo: stockInfo(), states: states(), calendar: calendar(), instruments: instruments(), historical: true, now: T_RHIMS });
  it("minimum order is compared on exact proceeds, not the 2 dp display (9.998 USDT is under 10)", () => {
    const r = sound({ ...ctx(), capture: rhims(), intent: { side: "sell", baseQty: "0.3572" }, ceilingBps: 500 });
    expect(r.gate).toBe("BELOW_MIN_ORDER");
  });
  it("malformed books are refused: zero quantity, and levels out of price order", () => {
    const z = rhims(); z.raw.data.bids[2] = [z.raw.data.bids[2][0], "0"]; z.raw_sha256 = rawHash(z.raw);
    expect(validateBook(z.raw)).toMatchObject({ valid: false, code: "INVALID_BOOK" });
    const u = rhims(); [u.raw.data.bids[0], u.raw.data.bids[1]] = [u.raw.data.bids[1], u.raw.data.bids[0]]; u.raw_sha256 = rawHash(u.raw);
    expect(validateBook(u.raw)).toMatchObject({ valid: false, code: "INVALID_BOOK" });
    const a = rhims(); [a.raw.data.asks[0], a.raw.data.asks[1]] = [a.raw.data.asks[1], a.raw.data.asks[0]]; a.raw_sha256 = rawHash(a.raw);
    expect(validateBook(a.raw)).toMatchObject({ valid: false, code: "INVALID_BOOK" });
  });
  it("the receipt digests the metadata the decision used, so changed rules change the receipt", () => {
    const a = sound({ ...ctx(), capture: rhims(), intent: { side: "sell", baseQty: "178.4121" }, ceilingBps: 50, userFeeBps: 8 });
    expect(a.receipt.metadata_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(a.receipt.metadata).toMatchObject({ stockInfo: { symbol: "RHIMSUSDT" }, instrument: { symbol: "RHIMSUSDT" } });
    const ins = instruments().map((x) => (x.symbol === "RHIMSUSDT" ? { ...x, minOrderAmount: "5" } : x));
    const b = sound({ ...ctx(), instruments: ins, capture: rhims(), intent: { side: "sell", baseQty: "178.4121" }, ceilingBps: 50, userFeeBps: 8 });
    expect(b.receipt.metadata_sha256).not.toBe(a.receipt.metadata_sha256);
    expect(b.receipt.receipt_sha256).not.toBe(a.receipt.receipt_sha256);
  });
});
