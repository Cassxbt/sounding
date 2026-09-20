import { describe, expect, it } from "vitest";
import { sound, rawHash, validateBook, buyWithBudget, sellShares } from "..";
import { D } from "../types";
import { calendar, rhims, rspmo, rspy, states, stockInfo, T_RHIMS } from "./helpers";

const ctx = () => ({ stockInfo: stockInfo(), states: states(), calendar: calendar(), historical: true, now: T_RHIMS });

describe("fixture integrity", () => {
  it("rHIMS raw hash matches the census hash the partner froze", () => {
    const fx = rhims();
    expect(rawHash(fx.raw)).toBe("51c18dc6b2926c4f65acc545686b03d5b548eac7fe33a3c139c0a8b50a8a2b2a");
    expect(fx.raw_sha256).toBe(rawHash(fx.raw));
  });
});

describe("rHIMS sell-side costs (partner-verified numbers)", () => {
  const mid = () => { const v = validateBook(rhims().raw); if (!v.valid) throw new Error(); return v.mid; };
  it.each([
    ["178.412132", "31.89", "4984.06"],
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
  it("178.412132 sh, ceiling 50 -> WITHIN at 0/10, OVER at 20, FEE_SENSITIVE", () => {
    const r = sound({ ...ctx(), capture: rhims(), intent: { side: "sell", baseQty: "178.412132" }, ceilingBps: 50 });
    expect(r.ok).toBe(true);
    expect(r.session).toBe("weekend_mm");
    expect(r.weekendTradable).toBe(true);
    expect(r.fees!.map((f) => [f.feeBps, f.allInBps, f.verdict])).toEqual([
      [0, "31.89", "WITHIN_CEILING_ON_THIS_SNAPSHOT"],
      [10, "41.89", "WITHIN_CEILING_ON_THIS_SNAPSHOT"],
      [20, "51.89", "OVER_CEILING_ON_THIS_SNAPSHOT"],
    ]);
    expect(r.feeSensitive).toBe(true);
    const kinds = r.alternatives!.map((a) => a.kind);
    expect(kinds).toEqual(["immediate_cross", "largest_within_ceiling", "resting_limit", "requote_at_switch"]);
    const largest = r.alternatives!.find((a) => a.kind === "largest_within_ceiling")!;
    // largest within 50 bps at the 20 bps fee scenario must itself be within, and smaller than the request
    const chk = sellShares(rhims().raw, largest.qty!, D("28.025"));
    expect(D(chk.bpsPreFee!).plus(20).lte(50)).toBe(true);
    expect(D(largest.qty!).lt("178.412132")).toBe(true);
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
  it("user-entered fee is added as a fourth labeled scenario", () => {
    const r = sound({ ...ctx(), capture: rhims(), intent: { side: "sell", baseQty: "178.412132" }, ceilingBps: 50, userFeeBps: 8 });
    const u = r.fees!.find((f) => f.source === "user")!;
    expect(u.feeBps).toBe(8); expect(u.allInBps).toBe("39.89"); expect(u.verdict).toBe("WITHIN_CEILING_ON_THIS_SNAPSHOT");
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
    const r = sound({ ...ctx(), capture: rhims(), intent: { side: "sell", baseQty: "178.412132" }, ceilingBps: 50, previousBpsPreFee: "10.00" });
    expect(r.gate).toBe("UNSTABLE_QUOTE");
  });
  it("tampered raw -> throws (hash mismatch)", () => {
    const t = rhims(); t.raw.data.bids[0][1] = "999";
    expect(() => sound({ ...ctx(), capture: t, intent: { side: "sell", baseQty: "1" }, ceilingBps: 50 })).toThrow(/hash/);
  });
});
