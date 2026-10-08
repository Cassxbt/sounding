import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sound } from "@/engine";
import { canonicalJson, sha256 } from "@/engine/book";
import { calendar, instruments, rhims, states, stockInfo, T_RHIMS } from "@/engine/__tests__/helpers";
import { prepare, verifyPrepared } from "../prepare";

const ctx = () => ({ stockInfo: stockInfo(), states: states(), calendar: calendar(), instruments: instruments(), historical: true, now: T_RHIMS });
const sell = (baseQty: string, ceilingBps: number, userFeeBps?: number) => sound({ ...ctx(), capture: rhims(), intent: { side: "sell", baseQty }, ceilingBps, userFeeBps });
const NOW = new Date(Number(rhims().exchange_ts));

describe("an Agent Hub order is prepared only from a checked decision", () => {
  beforeEach(() => { process.env.SOUNDING_RECEIPT_KEY = "test-key"; });
  afterEach(() => { delete process.env.SOUNDING_RECEIPT_KEY; });
  it("a server without a signing key confirms nothing, even an order it prepared", () => {
    delete process.env.SOUNDING_RECEIPT_KEY;
    const p = prepare(sell("178.4121", 40, 5), "stated", NOW);
    if (p.status !== "prepared") throw new Error("expected prepared");
    expect(p.signed).toBe(false);
    expect(verifyPrepared(p.order, p.binding, p.signature, NOW)).toMatchObject({ ok: false, reason: expect.stringMatching(/no signing key/) });
  });
  it("a forged binding for an order never prepared is rejected", () => {
    const p = prepare(sell("178.4121", 40, 5), "stated", NOW);
    if (p.status !== "prepared") throw new Error("expected prepared");
    const order = { ...p.order, qty: "5000" };
    const binding = { ...p.binding, order_sha256: sha256(canonicalJson(order)) };
    expect(verifyPrepared(order, binding, p.signature, NOW)).toMatchObject({ ok: false, reason: expect.stringMatching(/not issued/) });
  });
  it("within the ceiling: the exact Agent Hub order, bound to the receipt, the book and the fee's source", () => {
    const p = prepare(sell("178.4121", 40, 5), "bitget_account", NOW);
    expect(p.status).toBe("prepared");
    if (p.status !== "prepared") return;
    expect(p.order).toEqual({ action: "place", category: "SPOT", symbol: "RHIMSUSDT", side: "sell", orderType: "market", qty: "178.4121" });
    expect(p.command).toBe("bgc order --action place --category SPOT --symbol RHIMSUSDT --side sell --orderType market --qty 178.4121 --dry-run");
    expect(p.binding).toMatchObject({ fee: { bps: 5, source: "bitget_account" }, ceilingBps: 40, allInBps: "36.87" });
    expect(verifyPrepared(p.order, p.binding, p.signature, NOW)).toEqual({ ok: true });
  });
  it("over the ceiling: no order at all, and the largest size that fits offered as a new choice", () => {
    const p = prepare(sell("178.4121", 30, 5), "stated", NOW);
    expect(p.status).toBe("refused");
    if (p.status !== "refused") return;
    expect(p).not.toHaveProperty("order");
    expect(p.reason).toMatch(/36\.87 bps .* over your 30 bps ceiling/);
    expect(p.proposal).toMatchObject({ size: "101.834", unit: "sh", remainder: "76.5781" });
  });
  it("an unknown fee that decides the answer is a question, not an order", () => {
    const p = prepare(sell("178.4121", 40), "scenario", NOW);
    expect(p).toMatchObject({ status: "refused" });
    if (p.status === "refused") expect(p.reason).toMatch(/fee/);
  });
  it.each([["hold side", { side: "hold" }], ["negative size", { qty: "-5" }], ["a bigger size", { qty: "25000" }], ["another symbol", { symbol: "RSPYUSDT" }]])("an order changed after checking is rejected: %s", (_, change) => {
    const p = prepare(sell("178.4121", 40, 5), "stated", NOW);
    if (p.status !== "prepared") throw new Error("expected prepared");
    expect(verifyPrepared({ ...p.order, ...change } as never, p.binding, p.signature, NOW)).toMatchObject({ ok: false, reason: expect.stringMatching(/differs/) });
  });
  it("a preparation older than two minutes is rejected; the book is read again first", () => {
    const p = prepare(sell("178.4121", 40, 5), "stated", NOW);
    if (p.status !== "prepared") throw new Error("expected prepared");
    expect(verifyPrepared(p.order, p.binding, p.signature, new Date(NOW.getTime() + 121_000))).toMatchObject({ ok: false, reason: expect.stringMatching(/older/) });
  });
  it("an engine refusal (a size Bitget would reject) prepares nothing", () => {
    expect(prepare(sell("178.412132", 50, 5), "stated", NOW)).toMatchObject({ status: "refused" });
  });
});

describe("prepare after the sponsor-integrity audit", () => {
  it("a scenario fee is named as a scenario, never as the trader's", () => {
    const p = prepare(sell("178.4121", 30), "scenario", NOW);
    expect(p.status).toBe("refused");
    if (p.status === "refused") expect(p.reason).not.toMatch(/your \d+ bps fee/);
  });
  it("the fee decides: refused without one, prepared at the trader's 5 bps (sell 50 rHIMS, 20 bps ceiling)", () => {
    expect(prepare(sell("50", 20), "scenario", NOW)).toMatchObject({ status: "refused", reason: expect.stringMatching(/fee/) });
    expect(prepare(sell("50", 20, 5), "stated", NOW)).toMatchObject({ status: "prepared" });
  });
});
