import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { POST } from "../route";
import { applyFields, checkFields } from "@/analyst/intake";
import { EMPTY_CONSTRAINTS } from "@/analyst";
import { templateAnalysis } from "@/analyst/template";
import { validate } from "@/analyst/rules";
import { sound } from "@/engine";
import { rawHash } from "@/engine/book";
import { calendar, instruments, rhims, states, stockInfo, T_RHIMS } from "@/engine/__tests__/helpers";

// An established conversation: a previous answer exists and the fee and ceiling are known (independent review, 2026-10-08).
const ctx = () => ({ stockInfo: stockInfo(), states: states(), calendar: calendar(), instruments: instruments(), historical: true, now: T_RHIMS });
const c = { ...EMPTY_CONSTRAINTS, takerFeeBps: 8 };
const result = () => sound({ ...ctx(), capture: rhims(), intent: { side: "sell" as const, baseQty: "178.4121" }, userFeeBps: 8, ceilingBps: 50 });
const pack = () => JSON.parse(readFileSync("fixtures/evidence/RHIMSUSDT.json", "utf8"));
const post = async (text: string, extra: Record<string, unknown> = {}) => (await POST(new Request("http://x/api/analyst", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ symbol: "RHIMSUSDT", side: "sell", amount: "178.4121", ceilingBps: 50, mode: "recorded", analyst: "template", previous: templateAnalysis(result(), pack(), c), ...extra, turns: [{ role: "user", text }] }) }))).json();
afterEach(() => vi.restoreAllMocks());

describe("the trader's stated contract survives a follow-up", () => {
  it("a leading-dot size is read as written, never replaced by the earlier size", async () => {
    const j = await post("Sell .5 rHIMS, fee 8 bps.");
    expect(j.result.intent.baseQty).toBe("0.5");
  });
  it("a full-width minus is a negative size: asked, nothing priced", async () => {
    const j = await post("Sell －100 shares of rHIMS, fee 8 bps.");
    expect(j.result).toBeNull();
    expect(j.analyst.output.clarification).toBeTruthy();
  });
  it("'not able to hold through' keeps the hard exit", async () => {
    const j = await post("Sell 10 shares of rHIMS, fee 8 bps. I am not able to hold through the deadline.", { ceilingBps: 20, constraints: { ...c, mustBeFlat: true, hardDeadlineNy: "2026-09-21" } });
    expect(j.constraints.mustBeFlat).toBe(true);
    expect(j.constraints.hardDeadlineNy).toBe("2026-09-21");
  });
  it("an explicit year is kept", async () => {
    const j = await post("Sell 10 shares of rHIMS, fee 8 bps. Must be flat by Oct 8, 2027.");
    expect(j.constraints.hardDeadlineNy).toBe("2027-10-08");
  });
  it("a quoted date that leaves out 'before' is read with it: out by the day before", () => {
    const text = "Sell 10 shares of rHIMS, fee 8 bps. Must be flat before Oct 8. Ceiling 50 bps.";
    const fields = checkFields([{ name: "hardDeadlineNy", value: "2026-10-08", span: "Oct 8" }], text, "2026-09-20");
    expect(applyFields(EMPTY_CONSTRAINTS, fields).constraints.hardDeadlineNy).not.toBe("2026-10-08");
  });
  it("restating the same hard exit is not asked again", async () => {
    const j = await post("Sell 10 shares of rHIMS, fee 8 bps. Must be flat by Sep 21.", { constraints: { ...c, mustBeFlat: true, hardDeadlineNy: "2026-09-21" } });
    expect(j.analyst?.output.clarification ?? null).toBeNull();
  });
});

describe("numbers keep their roles", () => {
  it("the ceiling is not accepted as the order's all-in cost", () => {
    const r = result(), out = templateAnalysis(r, pack(), c);
    out.explanation = "Cross now at full size: 50 bps all-in at your 8 bps fee, inside your 50 bps ceiling on this snapshot.";
    expect(validate(out, r, pack(), c, "en").map((v) => v.rule)).toContain("invented_number");
  });
});

describe("a malformed book is refused", () => {
  it("a non-finite level quantity is INVALID_BOOK", () => {
    const cap = rhims(); cap.raw.data.bids[0][1] = "Infinity"; cap.raw_sha256 = rawHash(cap.raw);
    expect(sound({ ...ctx(), capture: cap, intent: { side: "sell", baseQty: "10" }, userFeeBps: 8, ceilingBps: 50 }).gate).toBe("INVALID_BOOK");
  });
});
