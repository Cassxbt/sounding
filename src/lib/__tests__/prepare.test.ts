import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sound } from "@/engine";
import { canonicalJson, sha256 } from "@/engine/book";
import { calendar, instruments, rhims, rspy, states, stockInfo, T_RHIMS } from "@/engine/__tests__/helpers";
import { prepare, verifyPrepared } from "../prepare";

const ctx = () => ({ stockInfo: stockInfo(), states: states(), calendar: calendar(), instruments: instruments(), historical: true, now: T_RHIMS });
const sell = (baseQty: string, ceilingBps: number, userFeeBps?: number) => sound({ ...ctx(), capture: rhims(), intent: { side: "sell", baseQty }, ceilingBps, userFeeBps });
const NOW = new Date(Number(rhims().exchange_ts));

describe("an Agent Hub order is prepared only from a checked decision", () => {
  beforeEach(() => { process.env.SOUNDING_RECEIPT_KEY = "test-key"; });
  afterEach(() => { delete process.env.SOUNDING_RECEIPT_KEY; });
  it("a server without a signing key confirms nothing, even an order it prepared", () => {
    delete process.env.SOUNDING_RECEIPT_KEY;
    const p = prepare(sell("178.4121", 50, 5), rhims().raw, "stated", NOW);
    if (p.status !== "prepared") throw new Error("expected prepared");
    expect(p.signed).toBe(false);
    expect(verifyPrepared(p.order, p.binding, p.signature, NOW)).toMatchObject({ ok: false, reason: expect.stringMatching(/no signing key/) });
  });
  it("a forged binding for an order never prepared is rejected", () => {
    const p = prepare(sell("178.4121", 50, 5), rhims().raw, "stated", NOW);
    if (p.status !== "prepared") throw new Error("expected prepared");
    const order = { ...p.order, qty: "5000" };
    const binding = { ...p.binding, order_sha256: sha256(canonicalJson(order)) };
    expect(verifyPrepared(order, binding, p.signature, NOW)).toMatchObject({ ok: false, reason: expect.stringMatching(/not issued/) });
  });
  it("within the ceiling: the exact Agent Hub order, a limit at the ceiling price, bound to the receipt, the book and the fee's source", () => {
    const p = prepare(sell("178.4121", 50, 5), rhims().raw, "bitget_account", NOW);
    expect(p.status).toBe("prepared");
    if (p.status !== "prepared") return;
    // 27.90 is where one share costs 50 bps all-in at 5 bps: Bitget fills nothing below it, so no fill can cost more.
    expect(p.order).toEqual({ action: "place", category: "SPOT", symbol: "RHIMSUSDT", side: "sell", orderType: "limit", price: "27.90", timeInForce: "ioc", qty: "178.4121" });
    expect(p.command).toBe("bgc order --action place --category SPOT --symbol RHIMSUSDT --side sell --orderType limit --price 27.90 --timeInForce ioc --qty 178.4121 --dry-run");
    expect(p.binding).toMatchObject({ fee: { bps: 5, source: "bitget_account" }, ceilingBps: 50, allInBps: "36.87", worstCaseBps: "49.58", expected: { qty: "178.4121", cash: "4984.05" } });
    expect(verifyPrepared(p.order, p.binding, p.signature, NOW)).toEqual({ ok: true });
  });
  it("average inside the ceiling is not enough: shares past the ceiling price refuse the order and the size that fits is offered", () => {
    const p = prepare(sell("178.4121", 40, 5), rhims().raw, "stated", NOW);
    expect(p).toMatchObject({ status: "refused", code: "PAST_CEILING_PRICE", proposal: { size: "66.0764", unit: "sh", remainder: "112.3357" } });
    if (p.status === "refused") expect(p.reason).toMatch(/36\.87 bps on average .* past 27\.93/);
  });
  it("over the ceiling: no order at all, and the size that fits inside a limit at the ceiling price offered as a new choice", () => {
    const p = prepare(sell("178.4121", 30, 5), rhims().raw, "stated", NOW);
    expect(p.status).toBe("refused");
    if (p.status !== "refused") return;
    expect(p).not.toHaveProperty("order");
    expect(p.reason).toMatch(/36\.87 bps .* over your 30 bps ceiling/);
    expect(p.proposal).toMatchObject({ size: "66.0764", unit: "sh", remainder: "112.3357" });
  });
  it("every prepared order holds its worst case inside the ceiling, and every offered size prepares (sells of 1 to 260 sh at 30, 40 and 50 bps)", () => {
    for (const c of [30, 40, 50]) for (let q = 1; q <= 260; q++) {
      const p = prepare(sell(String(q), c, 5), rhims().raw, "stated", NOW);
      if (p.status === "prepared") expect(Number(p.binding.worstCaseBps)).toBeLessThanOrEqual(c);
      else if (p.proposal) expect(prepare(sell(p.proposal.size, c, 5), rhims().raw, "stated", NOW).status).toBe("prepared");
    }
  });
  it("an unknown fee that decides the answer is a question, not an order", () => {
    const p = prepare(sell("178.4121", 40), rhims().raw, "scenario", NOW);
    expect(p).toMatchObject({ status: "refused" });
    if (p.status === "refused") expect(p.reason).toMatch(/fee/);
  });
  it.each([["hold side", { side: "hold" }], ["negative size", { qty: "-5" }], ["a bigger size", { qty: "25000" }], ["another symbol", { symbol: "RSPYUSDT" }]])("an order changed after checking is rejected: %s", (_, change) => {
    const p = prepare(sell("178.4121", 50, 5), rhims().raw, "stated", NOW);
    if (p.status !== "prepared") throw new Error("expected prepared");
    expect(verifyPrepared({ ...p.order, ...change } as never, p.binding, p.signature, NOW)).toMatchObject({ ok: false, reason: expect.stringMatching(/differs/) });
  });
  it("a preparation verified after the session switched to a US session is rejected: the order would route elsewhere", () => {
    const p = prepare(sell("178.4121", 50, 5), rhims().raw, "stated", NOW);
    if (p.status !== "prepared") throw new Error("expected prepared");
    expect(verifyPrepared(p.order, p.binding, p.signature, NOW, "overnight")).toMatchObject({ ok: false, reason: expect.stringMatching(/US market/) });
    expect(verifyPrepared(p.order, p.binding, p.signature, NOW, "weekend_mm")).toEqual({ ok: true });
  });
  it("a preparation older than two minutes is rejected; the book is read again first", () => {
    const p = prepare(sell("178.4121", 50, 5), rhims().raw, "stated", NOW);
    if (p.status !== "prepared") throw new Error("expected prepared");
    expect(verifyPrepared(p.order, p.binding, p.signature, new Date(NOW.getTime() + 121_000))).toMatchObject({ ok: false, reason: expect.stringMatching(/older/) });
  });
  it("an engine refusal (a size Bitget would reject) prepares nothing", () => {
    expect(prepare(sell("178.412132", 50, 5), rhims().raw, "stated", NOW)).toMatchObject({ status: "refused" });
  });
});

describe("a buy is a limit IOC that cannot spend more than the budget", () => {
  beforeEach(() => { process.env.SOUNDING_RECEIPT_KEY = "test-key"; });
  afterEach(() => { delete process.env.SOUNDING_RECEIPT_KEY; });
  it("1,000 USDT of rSPY: shares the budget covers at the ceiling price, priced again at that size, the rest named", () => {
    const res = sound({ ...ctx(), capture: rspy(), intent: { side: "buy", quoteBudget: "1000" }, ceilingBps: 40, userFeeBps: 5 });
    const p = prepare(res, rspy().raw, "stated", NOW);
    if (p.status !== "prepared") throw new Error("expected prepared");
    expect(p.order).toEqual({ action: "place", category: "SPOT", symbol: "RSPYUSDT", side: "buy", orderType: "limit", price: "765.55", timeInForce: "ioc", qty: "1.3062" });
    expect(Number(p.order.qty) * Number(p.order.price)).toBeLessThanOrEqual(1000);
    expect(p.binding).toMatchObject({ allInBps: "15.09", worstCaseBps: "39.95", expected: { qty: "1.3062", cash: "997.49", unspentUsdt: "2.51" } });
  });
});

describe("prepare after the sponsor-integrity audit", () => {
  it("a scenario fee is named as a scenario, never as the trader's", () => {
    const p = prepare(sell("178.4121", 30), rhims().raw, "scenario", NOW);
    expect(p.status).toBe("refused");
    if (p.status === "refused") expect(p.reason).not.toMatch(/your \d+ bps fee/);
  });
  it("the fee decides: refused without one, prepared at the trader's 5 bps (sell 16 rHIMS, 20 bps ceiling)", () => {
    expect(prepare(sell("16", 20), rhims().raw, "scenario", NOW)).toMatchObject({ status: "refused", reason: expect.stringMatching(/fee/) });
    expect(prepare(sell("16", 20, 5), rhims().raw, "stated", NOW)).toMatchObject({ status: "prepared" });
  });
});
