import { describe, expect, it } from "vitest";
import { sound } from "..";
import { replayBundle } from "../replayfile";
import { calendar, instruments, rhims, states, stockInfo, T_RHIMS } from "./helpers";

const base = { capture: rhims(), intent: { side: "sell" as const, baseQty: "178.4121" }, ceilingBps: 50, userFeeBps: 8, stockInfo: stockInfo(), states: states(), calendar: calendar(), instruments: instruments() };

describe("a downloaded receipt replays to the same hash", () => {
  it("recorded decision", () => {
    const r = sound({ ...base, now: T_RHIMS, historical: true });
    expect(replayBundle({ receipt: r.receipt, capture: base.capture, sessionInputs: { states: states(), calendar: calendar() } })).toMatchObject({ matches: true });
  });
  it("live-style decision evaluated at its own clock, with a stability input", () => {
    const now = new Date(Number(base.capture.exchange_ts) + 1200);
    const r = sound({ ...base, now, historical: false, previousBpsPreFee: "31.5" });
    const b = { receipt: r.receipt, capture: base.capture, sessionInputs: { states: states(), calendar: calendar() }, previousBpsPreFee: "31.5" };
    expect(replayBundle(b)).toMatchObject({ matches: true });
    expect(replayBundle({ ...b, receipt: { ...r.receipt, ceilingBps: 60 } }).matches).toBe(false);
  });
});
