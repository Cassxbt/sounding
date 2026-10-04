import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "../route";
import { POST as SOUND } from "../../sound/route";
import { answerTimeCheck } from "@/lib/answercheck";
import { sound } from "@/engine";
import { calendar, instruments, rhims, states, stockInfo, T_RHIMS } from "@/engine/__tests__/helpers";
import { recordedCapture } from "@/lib/data";
import type { BookCapture } from "@/engine/types";

const post = (h: (r: Request) => Promise<Response>, body: unknown) => h(new Request("http://x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
const controls = { symbol: "RHIMSUSDT", side: "sell", amount: "178.4121", ceilingBps: 50, mode: "recorded", analyst: "template" };
afterEach(() => vi.restoreAllMocks());

describe("the stated order wins over the controls (partner P0 repro)", () => {
  it("'Buy 1,000 USDT of rSPY' with Sell/rHIMS controls prices the rSPY buy, never the rHIMS sell", async () => {
    const j = await (await post(POST, { ...controls, turns: [{ role: "user", text: "Buy 1,000 USDT of rSPY. Fee 8 bps." }] })).json();
    expect(j.order).toEqual({ symbol: "RSPYUSDT", side: "buy" });
    expect(j.result.symbol).toBe("RSPYUSDT");
    expect(j.result.intent).toEqual({ side: "buy", quoteBudget: "1000" });
  });
  it("the same in Chinese: the order switches, and the rHIMS sell is never priced", async () => {
    const j = await (await post(POST, { ...controls, turns: [{ role: "user", text: "用1000 USDT买入rSPY，手续费8个基点，成本上限50个基点。" }] })).json();
    expect(j.order).toEqual({ symbol: "RSPYUSDT", side: "buy" });
    expect(j.result === null || (j.result.symbol === "RSPYUSDT" && j.result.intent.side === "buy")).toBe(true);
  });
  it("a side change with no size in the right unit asks for the size and prices nothing", async () => {
    const j = await (await post(POST, { ...controls, turns: [{ role: "user", text: "Actually buy rHIMS instead, fee 8 bps." }] })).json();
    expect(j.result).toBeNull();
    expect(j.analyst.output.recommendation).toBeNull();
    expect(j.analyst.output.clarification).toMatch(/USDT/);
  });
  it("a stated order with no recorded book says so instead of pricing the controls", async () => {
    const j = await (await post(POST, { ...controls, turns: [{ role: "user", text: "Sell 10 rNVDA, fee 8 bps." }] })).json();
    expect(j.result).toBeNull();
    expect(j.note).toMatch(/no recorded book/i);
  });
});

describe("inputs are checked at the boundary", () => {
  it("a 0 bps ceiling stays 0", async () => {
    const j = await (await post(SOUND, { ...controls, ceilingBps: 0, userFeeBps: 8 })).json();
    expect(j.result.ceilingBps).toBe(0);
  });
  it("a negative fee or a non-numeric ceiling is refused", async () => {
    expect((await post(SOUND, { ...controls, userFeeBps: -100 })).status).toBe(400);
    expect((await post(SOUND, { ...controls, ceilingBps: "lots" })).status).toBe(400);
    expect((await post(POST, { ...controls, userFeeBps: -1, turns: [{ role: "user", text: "sell it" }] })).status).toBe(400);
  });
  it("live mode fails closed when Bitget metadata cannot be fetched", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));
    const r = await post(SOUND, { ...controls, mode: "live" });
    expect(r.status).toBe(503);
  });
});

describe("answer-time check", () => {
  const ctx = { stockInfo: stockInfo(), states: states(), calendar: calendar(), instruments: instruments(), historical: true };
  const at = (c: BookCapture, fee = 8) => sound({ ...ctx, now: new Date(Number(c.exchange_ts)), capture: c, intent: { side: "sell", baseQty: "178.4121" }, ceilingBps: 50, userFeeBps: fee });
  it("stands when the fresh book agrees", () => {
    const a = recordedCapture("RHIMSUSDT@20261003a")!, b = recordedCapture("RHIMSUSDT@20261003b")!;
    expect(answerTimeCheck(at(a), at(b)).status).toBe("stands");
  });
  it("moves when the fresh book flips the verdict or the price moves beyond the stability threshold", () => {
    const c = rhims(); expect(answerTimeCheck(at(c), at(recordedCapture("RHIMSUSDT@20261003b")!)).status).toBe("moved");
    void T_RHIMS;
  });
});

describe("a size in the wrong unit is asked about", () => {
  it("'sell 1000 USDT of rHIMS' with sell controls asks for shares instead of selling the controls' size", async () => {
    const j = await (await post(POST, { ...controls, turns: [{ role: "user", text: "sell 1000 USDT of rHIMS, fee 8 bps" }] })).json();
    expect(j.result).toBeNull();
    expect(j.analyst.output.clarification).toMatch(/shares/);
  });
});
