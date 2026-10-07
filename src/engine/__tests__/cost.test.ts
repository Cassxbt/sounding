import { describe, expect, it } from "vitest";
import { buyWithBudget, sellShares, withinCeiling } from "../book";
import { allInBps } from "../cost";
import { D } from "../types";

// mid 100; one level each side, 25 bps from mid
const raw = { data: { asks: [["100.25", "1000"]] as [string, string][], bids: [["99.75", "1000"]] as [string, string][], ts: "0" } };

describe("exact all-in cost: the fee is charged on what is traded, not on mid", () => {
  it("a buy pays the fee on top of the price it walked to", () => {
    const leg = buyWithBudget(raw as never, "1000", D(100));
    expect(allInBps(leg, 5).toString()).toBe("30.0125");
    expect(withinCeiling(leg, 5, 30)).toBe(false);
  });
  it("a sell pays the fee out of proceeds already below mid", () => {
    const leg = sellShares(raw as never, "10", D(100));
    expect(allInBps(leg, 5).toString()).toBe("29.9875");
    expect(withinCeiling(leg, 5, 29.99)).toBe(true);
  });
});
