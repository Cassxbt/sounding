import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { POST } from "../route";
import { readBps, readDate } from "@/analyst/normalize";
import { sound } from "@/engine";
import { rawHash } from "@/engine/book";
import { calendar, instruments, rhims, states, stockInfo, T_RHIMS } from "@/engine/__tests__/helpers";

const post = (body: unknown) => POST(new Request("http://x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
const controls = { symbol: "RHIMSUSDT", side: "sell", amount: "178.4121", ceilingBps: 50, mode: "recorded", analyst: "template" };
const say = async (text: string, extra = {}) => (await post({ ...controls, turns: [{ role: "user", text }], ...extra })).json();
afterEach(() => vi.restoreAllMocks());

describe("one question, one state: nothing actionable while a question is open (re-audit P0)", () => {
  it("two instruments: no priced card, no admissible route", async () => {
    const j = await say("Buy 1,000 USDT of rSPY and 1,000 USDT of rHIMS. My fee is 8 bps; ceiling 50 bps.");
    expect(j.analyst.output.clarification).toMatch(/more than one instrument/);
    expect(j.result).toBeNull();
    expect(j.analyst.output.admissible).toEqual([]);
    expect(j.analyst.output.recommendation).toBeNull();
  });
  it("any open question marks the answer not actionable", async () => {
    const j = await say("Sell 178.4121 rHIMS, I must be out by the 9th, I pay 8 bps");
    if (j.analyst.output.clarification) expect(j.actionable).toBe(false);
    else expect(j.actionable).toBe(true);
  });
});

describe("a typed size that is not a positive number is asked, never replaced (re-audit P1)", () => {
  it.each(["sell -100 shares of rHIMS, fee 8 bps", "sell 0 shares of rHIMS, fee 8 bps"])("%s", async (t) => {
    const j = await say(t);
    expect(j.result).toBeNull();
    expect(j.analyst.output.clarification).toBeTruthy();
  });
});

describe("chat values are validated like form values before pricing (re-audit P2)", () => {
  it("a 10,000 bps fee from chat is asked back", async () => {
    const j = await say("sell 10 rHIMS, fee 10000 bps");
    expect(j.result).toBeNull();
    expect(j.analyst.output.clarification).toMatch(/fee/i);
  });
  it("impossible dates and signed negative costs are not read", () => {
    expect(readDate("by Feb 31", "2026-10-04")).toBeNull();
    expect(readBps("fee -8 bps")).toBeNull();
    expect(readBps("fee −8 bps")).toBeNull();
  });
});

describe("the largest size that fits clears the minimum on exact proceeds (re-audit P1)", () => {
  it("a clip whose exact proceeds are under 10 USDT is not offered", () => {
    const c = rhims(); c.raw.data.bids = [["1", "9.996"], ["0.9", "30"]]; c.raw.data.asks = [["1.01", "30"]]; c.raw_sha256 = rawHash(c.raw);
    const r = sound({ capture: c, intent: { side: "sell", baseQty: "20" }, ceilingBps: 50, userFeeBps: 0, now: T_RHIMS, historical: true, stockInfo: stockInfo(), states: states(), calendar: calendar(), instruments: instruments() });
    const clip = r.alternatives?.find((a) => a.kind === "largest_within_ceiling");
    expect(clip === undefined || Number(clip.qty) * 1 >= 10).toBe(true);
  });
});

describe("a live answer is only ever shown with the book it was checked on (re-audit P0)", () => {
  const fx = (n: string) => JSON.parse(readFileSync(`fixtures/${n}`, "utf8"));
  function mockLive(scale: number) {
    let reads = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const p = String(url);
      if (p.includes("/stock-info")) return Response.json(fx("stock-info-20260920.json"));
      if (p.includes("/states")) return Response.json({ data: fx("market-states-20260920.json").states });
      if (p.includes("/calendar")) return Response.json({ data: fx("calendar-20260920.json") });
      if (p.includes("/instruments")) return Response.json({ data: fx("instruments-20260923.json").rows });
      if (p.includes("/orderbook")) {
        reads++;
        const raw = structuredClone(fx("rhims-20260920T090235Z.json").raw);
        raw.requestTime = Date.now(); raw.data.ts = String(Date.now());
        if (reads >= 2) raw.data.bids = raw.data.bids.map(([pr, q]: [string, string]) => [(Number(pr) * scale).toFixed(2), q]);
        return Response.json(raw);
      }
      return new Response("unavailable", { status: 503 });
    });
  }
  const live = { ...controls, mode: "live", turns: [{ role: "user", text: "sell it, fee 8 bps" }] };
  it("moved: no route, no stale number, one neutral answer", async () => {
    mockLive(0.99);
    const j = await (await post(live)).json();
    expect(j.answerCheck.status).toBe("moved");
    expect(j.actionable).toBe(false);
    expect(j.analyst.output.recommendation).toBeNull();
    expect(j.analyst.output.admissible).toEqual([]);
    // The old figure may appear only as superseded ("changed from 39.89 to ..."), never as advice.
    expect(j.analyst.output.explanation).not.toMatch(/cross now|inside your/i);
    expect(j.analyst.output.explanation).not.toMatch(/(?<!from )39\.89/);
    expect(j.analyst.output.explanation).toMatch(/moved/);
  });
  it("stands with a small drift: every number in the answer is the fresh book's", async () => {
    mockLive(0.9998);
    const j = await (await post(live)).json();
    expect(j.answerCheck.status).toBe("stands");
    const fresh = j.result.fees.find((f: { source: string }) => f.source === "user").allInBps;
    for (const m of String(j.analyst.output.explanation).matchAll(/(\d+\.\d+)\s*bps/g)) expect(j.result.fees.map((f: { allInBps: string }) => f.allInBps).concat([j.result.leg.bpsPreFee])).toContain(m[1]);
    expect(fresh).toBeTruthy();
  });
});
