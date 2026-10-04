import { describe, expect, it } from "vitest";
import { POST } from "../route";
import { recordedCapture } from "@/lib/data";

const ask = (body: Record<string, unknown>) => POST(new Request("http://x/api/analyst", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
const base = { symbol: "RHIMSUSDT", side: "sell", amount: "178.4121", ceilingBps: 50, mode: "recorded", analyst: "template", turns: [{ role: "user", text: "Sell it all, I must be flat by Oct 8." }] };

describe("/api/analyst", () => {
  it("a fee typed in the form reaches the analyst, not only the engine", async () => {
    const j = await (await ask({ ...base, userFeeBps: 8 })).json();
    expect(j.constraints.takerFeeBps).toBe(8);
    expect(j.analyst.violations).toEqual([]);
    expect(j.analyst.output.recommendation).toBe("immediate_cross");
  });
  it("reads the same recorded book the page shows", async () => {
    const j = await (await ask({ ...base, userFeeBps: 8, fixture: "RHIMSUSDT@20261003a" })).json();
    expect(j.result.receipt.exchange_ts).toBe(recordedCapture("RHIMSUSDT@20261003a")!.exchange_ts);
  });
  it("a recorded book for a different symbol is never used: the order's own book is", async () => {
    const j = await (await ask({ ...base, fixture: "RSPYUSDT" })).json();
    expect(j.result.symbol).toBe("RHIMSUSDT");
  });
});
