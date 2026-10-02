import { describe, expect, it } from "vitest";
import { readBps, readDate, readQty, spanInText } from "../normalize";
import { applyFields, checkFields } from "../intake";
import { EMPTY_CONSTRAINTS } from "..";

const TODAY = "2026-10-02";

describe("code readers for trader phrasing", () => {
  it.each([
    ["I pay 0.08% taker", 8], ["fee 8bp", 8], ["my taker is 8 bps", 8], ["I pay 0.1% fees", 10],
    ["keep it under half a percent", 50], ["0.5%", 50], ["千分之0.8", 8], ["万8", 8], ["50 basis points", 50],
  ])("readBps(%s) = %s", (s, v) => expect(readBps(s as string)).toBe(v));
  it("readBps returns null rather than guessing", () => expect(readBps("cheap please")).toBeNull());

  it.each([
    ["before the 8th", "2026-10-08"], ["Oct 8", "2026-10-08"], ["October 8th", "2026-10-08"], ["8 Oct", "2026-10-08"],
    ["10/8", "2026-10-08"], ["10月8日", "2026-10-08"], ["2026-10-08", "2026-10-08"], ["by the 1st", "2026-11-01"], ["Jan 5", "2027-01-05"],
  ])("readDate(%s) = %s", (s, v) => expect(readDate(s as string, TODAY)).toBe(v));

  it("readQty", () => { expect(readQty("178.4121 rHIMS")).toBe("178.4121"); expect(readQty("1,000 USDT")).toBe("1000"); });
  it("spanInText ignores case and spacing but not invented words", () => {
    expect(spanInText("I PAY 0.08%  taker", "out of HIMS, i pay 0.08% taker")).toBe(true);
    expect(spanInText("I pay 0.05% taker", "i pay 0.08% taker")).toBe(false);
  });
});

describe("checked intake", () => {
  const text = "out of HIMS before the 8th, I pay 0.08% taker, keep it under half a percent, must be flat";
  it("accepts model values that code confirms from the cited span (the devil's-advocate paraphrase)", () => {
    const f = checkFields([
      { name: "takerFeeBps", value: 8, span: "I pay 0.08% taker" },
      { name: "ceilingBps", value: 50, span: "keep it under half a percent" },
      { name: "hardDeadlineNy", value: "2026-10-08", span: "before the 8th" },
      { name: "mustBeFlat", value: true, span: "must be flat" },
    ], text, TODAY);
    expect(f.every((x) => x.status === "accepted")).toBe(true);
    expect(f.filter((x) => x.source === "model+code").map((x) => x.name)).toEqual(["takerFeeBps", "ceilingBps", "hardDeadlineNy"]);
    const r = applyFields(EMPTY_CONSTRAINTS, f);
    expect(r.constraints).toMatchObject({ takerFeeBps: 8, hardDeadlineNy: "2026-10-08", mustBeFlat: true });
    expect(r.ceilingBps).toBe(50);
  });
  it("rejects a value whose cited words are not in the message (hallucinated span)", () => {
    const f = checkFields([{ name: "takerFeeBps", value: 5, span: "I pay 0.05% taker" }], text, TODAY);
    expect(f[0].status).toBe("rejected_span");
    expect(applyFields(EMPTY_CONSTRAINTS, f).constraints.takerFeeBps).toBeNull();
  });
  it("holds a field when the model's number disagrees with code's reading of the same span", () => {
    const f = checkFields([{ name: "takerFeeBps", value: 80, span: "I pay 0.08% taker" }], text, TODAY);
    expect(f[0].status).toBe("conflict");
    expect(applyFields(EMPTY_CONSTRAINTS, f).constraints.takerFeeBps).toBeNull();
  });
  it("release of a deadline clears it", () => {
    const f = checkFields([{ name: "releaseDeadline", value: true, span: "I can hold through" }], "actually I can hold through the transition", TODAY);
    expect(applyFields({ ...EMPTY_CONSTRAINTS, mustBeFlat: true, hardDeadlineNy: "2026-10-08" }, f).constraints).toMatchObject({ mustBeFlat: false, hardDeadlineNy: null });
  });
});
