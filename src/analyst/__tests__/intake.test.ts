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
    ["before the 8th", "2026-10-07"], ["by the 8th", "2026-10-08"], ["10月9日之前", "2026-10-08"], ["before Nov 1", "2026-10-31"], ["Oct 8", "2026-10-08"], ["October 8th", "2026-10-08"], ["8 Oct", "2026-10-08"],
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
  it("accepts model values that code confirms from the cited span (a paraphrase the regex reader misses)", () => {
    const f = checkFields([
      { name: "takerFeeBps", value: 8, span: "I pay 0.08% taker" },
      { name: "ceilingBps", value: 50, span: "keep it under half a percent" },
      { name: "hardDeadlineNy", value: "2026-10-07", span: "before the 8th" },
      { name: "mustBeFlat", value: true, span: "must be flat" },
    ], text, TODAY);
    expect(f.every((x) => x.status === "accepted")).toBe(true);
    expect(f.filter((x) => x.source === "model+code").map((x) => x.name)).toEqual(["takerFeeBps", "ceilingBps", "hardDeadlineNy"]);
    const r = applyFields(EMPTY_CONSTRAINTS, f);
    expect(r.constraints).toMatchObject({ takerFeeBps: 8, hardDeadlineNy: "2026-10-07", mustBeFlat: true });
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

describe("deadlines: code must confirm the date", () => {
  const SAT = "2026-10-03";
  it.each([
    ["by fri", "2026-10-09"], ["by Monday", "2026-10-05"], ["before Wednesday", "2026-10-06"], ["周五前", "2026-10-08"], ["Friday 前", "2026-10-08"], ["星期三之前", "2026-10-06"], ["礼拜一", "2026-10-05"],
    ["on or before October 20", "2026-10-20"], ["8号之前", "2026-10-07"], ["9号", "2026-10-09"], ["2号前", "2026-11-01"], ["10月12日（含）之前", "2026-10-12"], ["最晚10月9日", "2026-10-09"], ["by Oct 9", "2026-10-09"],
  ])("readDate(%s) on a Saturday = %s", (s, v) => expect(readDate(s as string, SAT)).toBe(v));
  it("'by Friday' said on a Friday means today", () => expect(readDate("by Friday", TODAY)).toBe("2026-10-02"));
  it("relative weeks are not guessed", () => expect(readDate("by next Friday", SAT)).toBeNull());
  it("a recently passed month-day stays in this year (asked back), it does not roll a year later", () => expect(readDate("by Oct 1", TODAY)).toBe("2026-10-01"));

  it("a deadline code cannot read is asked back, never taken on the model's word", () => {
    const text = "dump 60 rPLTR by next Friday";
    const f = checkFields([{ name: "hardDeadlineNy", value: "2026-10-09", span: "by next Friday" }], text, SAT);
    expect(f[0].status).toBe("conflict");
    expect(applyFields(EMPTY_CONSTRAINTS, f).constraints.hardDeadlineNy).toBeNull();
  });
  it("a deadline already past is asked back even when model and code agree", () => {
    const f = checkFields([{ name: "hardDeadlineNy", value: "2026-10-01", span: "by Oct 1" }], "sell by Oct 1", TODAY);
    expect(f[0].status).toBe("conflict");
    expect(f[0].note).toMatch(/already passed/);
  });
  it("the model's past weekday date is replaced by code's reading (eval v1 P02)", () => {
    const f = checkFields([{ name: "hardDeadlineNy", value: "2026-10-02", span: "out by fri" }], "sell 250 rNVDA, out by fri hard", SAT);
    expect(f[0]).toMatchObject({ status: "accepted", source: "code", value: "2026-10-09" });
  });
  it("code's stricter date is used; a looser code date is asked back", () => {
    expect(checkFields([{ name: "hardDeadlineNy", value: "2026-10-07", span: "周三前" }], "周三前必须出", SAT)[0]).toMatchObject({ status: "accepted", value: "2026-10-06" });
    expect(checkFields([{ name: "hardDeadlineNy", value: "2026-10-05", span: "by Oct 9" }], "out by Oct 9", SAT)[0].status).toBe("conflict");
  });
  it("'not before' is an earliest date, not a deadline", () => {
    const f = checkFields([{ name: "hardDeadlineNy", value: "2026-10-07", span: "not before the 8th" }], "Selling 90 rGOOGL but not before the 8th", SAT);
    expect(f[0].status).toBe("rejected_meaning");
    expect(applyFields(EMPTY_CONSTRAINTS, f).constraints.hardDeadlineNy).toBeNull();
  });
});

describe("readers after held-out v2 (development; v2 numbers above are pre-fix)", () => {
  const WED = "2026-10-07";
  it.each([["千分之六", 60], ["万分之三十五", 35], ["万分之八", 8], ["千分之零点八", 8], ["千分之五", 50], ["万十", 10], ["万6", 6]])("readBps(%s) = %s", (s, v) => expect(readBps(s as string)).toBe(v));
  it.each([["1.2k usdt", "1200"], ["2k USDT", "2000"], ["1万 USDT", "10000"], ["1,250", "1250"]])("readQty(%s) = %s", (s, v) => expect(readQty(s as string)).toBe(v));
  it.each([["明天之内", "2026-10-08"], ["by tomorrow", "2026-10-08"], ["today", "2026-10-07"], ["今天之前", "2026-10-06"]])("readDate(%s) = %s", (s, v) => expect(readDate(s as string, WED)).toBe(v));
  it("'之前不要卖' is an earliest date, not a deadline", () => {
    const f = checkFields([{ name: "hardDeadlineNy", value: "2026-10-12", span: "10月13日之前不要卖" }], "rSPY 卖 80 股，10月13日之前不要卖", WED);
    expect(f[0].status).toBe("rejected_meaning");
  });
  it("a date inside the must-be-flat words supplies the deadline when the model gave none", () => {
    const f = checkFields([{ name: "mustBeFlat", value: true, span: "Need to be flat by Friday" }], "Selling 40 rAAPL. Need to be flat by Friday.", WED);
    expect(f.find((x) => x.name === "hardDeadlineNy")).toMatchObject({ value: "2026-10-09", source: "code", status: "accepted" });
  });
});
