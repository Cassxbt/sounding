import { describe, expect, it } from "vitest";
import { readBps, readDate, readQty, spanInText } from "../normalize";
import { applyFields, checkFields, regexIntake } from "../intake";
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

describe("order contract: instrument and side are read and checked like any limit", () => {
  const UNI = [{ code: "HIMS", symbol: "RHIMSUSDT" }, { code: "SPY", symbol: "RSPYUSDT" }, { code: "BE", symbol: "RBEUSDT" }, { code: "NVDA", symbol: "RNVDAUSDT" }];
  const D8 = "2026-10-03";
  it("accepts the model's instrument and side when code resolves the same from the quoted words", () => {
    const text = "Buy 1,000 USDT of rSPY. Fee 8 bps, ceiling 50 bps.";
    const f = checkFields([{ name: "symbol", value: "rSPY", span: "rSPY" }, { name: "side", value: "buy", span: "Buy 1,000 USDT" }], text, D8, UNI);
    expect(f.find((x) => x.name === "symbol")).toMatchObject({ status: "accepted", value: "RSPYUSDT", source: "model+code" });
    expect(f.find((x) => x.name === "side")).toMatchObject({ status: "accepted", value: "buy", source: "model+code" });
  });
  it("code reads the instrument and side when the model leaves them out", () => {
    const f = checkFields([], "卖出178.4121股rHIMS，吃单手续费千分之0.8", D8, UNI);
    expect(f.find((x) => x.name === "symbol")).toMatchObject({ status: "accepted", value: "RHIMSUSDT", source: "code" });
    expect(f.find((x) => x.name === "side")).toMatchObject({ status: "accepted", value: "sell", source: "code" });
  });
  it("ordinary words are not tickers: 'must be out' is not rBE", () => {
    const f = checkFields([], "Sell 178.4121 rHIMS, I must be out before the 8th", D8, UNI);
    expect(f.filter((x) => x.name === "symbol").map((x) => x.value)).toEqual(["RHIMSUSDT"]);
  });
  it("two instruments, or buy and sell words together, are asked back", () => {
    expect(checkFields([], "sell rHIMS and buy rNVDA", D8, UNI).filter((x) => x.status === "conflict").map((x) => x.name)).toEqual(expect.arrayContaining(["symbol", "side"]));
  });
  it("a limit stated with a figure or a date but not read is asked back, never defaulted", () => {
    const f = checkFields([{ name: "sizeShares", value: "178.4121", span: "178.4121" }], "Sell 178.4121 rHIMS, my taker fee is 万八 or so, I must be out by Friday", D8, UNI);
    const held = f.filter((x) => x.status === "conflict").map((x) => x.name);
    expect(held).toEqual(expect.arrayContaining(["takerFeeBps", "hardDeadlineNy"]));
  });
  it("naming a fee with no figure ('the fee we agreed') is not asked: an unknown fee already falls to the worst case", () => {
    const f = checkFields([{ name: "sizeShares", value: "178.4121", span: "178.4121" }], "Sell 178.4121 rHIMS, my taker fee is what we agreed", D8, UNI);
    expect(f.find((x) => x.name === "takerFeeBps")).toBeUndefined();
  });
  it("a fully read message raises no question", () => {
    const text = "Sell 178.4121 rHIMS. I pay 0.08% taker, keep it under half a percent all-in, and I must be out before the 8th.";
    const f = checkFields([
      { name: "sizeShares", value: "178.4121", span: "178.4121" }, { name: "takerFeeBps", value: 8, span: "I pay 0.08% taker" },
      { name: "ceilingBps", value: 50, span: "under half a percent" }, { name: "hardDeadlineNy", value: "2026-10-07", span: "before the 8th" },
      { name: "mustBeFlat", value: true, span: "I must be out before the 8th" },
    ], text, D8, UNI);
    expect(f.filter((x) => x.status !== "accepted")).toEqual([]);
  });
});

describe("ticker reading after ST7", () => {
  const UNI = [{ code: "HIMS", symbol: "RHIMSUSDT" }, { code: "SPY", symbol: "RSPYUSDT" }, { code: "ALL", symbol: "RALLUSDT" }, { code: "ON", symbol: "RONUSDT" }, { code: "NOW", symbol: "RNOWUSDT" }, { code: "IT", symbol: "RITUSDT" }];
  const D8 = "2026-10-03";
  it("'Sell it ALL' is not an order for rALL, and 'rHIMS ON Monday' names one instrument", () => {
    expect(checkFields([], "Sell it ALL, fee 8 bps", D8, UNI).find((f) => f.name === "symbol")).toBeUndefined();
    expect(checkFields([], "sell rHIMS ON Monday, fee 8 bps", D8, UNI).find((f) => f.name === "symbol")).toMatchObject({ status: "accepted", value: "RHIMSUSDT" });
  });
  it("a bare ticker counts when the model names it as the instrument, but never a common word", () => {
    expect(checkFields([{ name: "symbol", value: "SPY", span: "SPY" }], "buy 1000 USDT of SPY", D8, UNI).find((f) => f.name === "symbol")).toMatchObject({ status: "accepted", value: "RSPYUSDT" });
    expect(checkFields([{ name: "symbol", value: "ALL", span: "ALL" }], "sell it ALL", D8, UNI).find((f) => f.name === "symbol")?.status).toBe("conflict");
  });
  it("an r-ticker not on Bitget's list is asked back, never replaced by the controls", () => {
    expect(checkFields([], "sell 100 rZZZZ, fee 8 bps", D8, UNI).find((f) => f.name === "symbol")).toMatchObject({ status: "conflict" });
  });
  it("the fallback reader also asks about a limit it saw but could not read", () => {
    const r = regexIntake("Sell 178.4121 rHIMS, I pay 千分之0.8 taker", EMPTY_CONSTRAINTS, UNI);
    expect(r.clarification).toMatch(/taker fee/);
  });
});

describe("after the held-out whole-task run (development)", () => {
  const UNI = [{ code: "HIMS", symbol: "RHIMSUSDT" }, { code: "SPY", symbol: "RSPYUSDT" }, { code: "SPMO", symbol: "RSPMOUSDT" }];
  const D = "2026-09-20";
  it("a message naming two instruments is asked back even when the model picked one", () => {
    const f = checkFields([{ name: "symbol", value: "rSPMO", span: "rSPMO" }], "Split it: 1,000 USDT into rSPY and 1,000 USDT into rSPMO.", D, UNI);
    expect(f.find((x) => x.name === "symbol")?.status).toBe("conflict");
  });
  it("two different fees in one sentence are asked back", () => {
    const f = checkFields([{ name: "takerFeeBps", value: 6, span: "6 bps" }], "Sell 10 rSPY. My taker fee is 6 bps, which is 0.1%.", D, UNI);
    expect(f.find((x) => x.name === "takerFeeBps")?.status).toBe("conflict");
  });
  it("a fee and a ceiling in one sentence are not a contradiction", () => {
    const f = checkFields([{ name: "takerFeeBps", value: 8, span: "fee 8 bps" }, { name: "ceilingBps", value: 50, span: "ceiling 50 bps" }], "Buy 1,000 USDT of rSPY, fee 8 bps, ceiling 50 bps.", D, UNI);
    expect(f.filter((x) => x.status === "conflict")).toEqual([]);
  });
  it("naming a limit without a value is not a question: 'under the ceiling', 'ceiling 照旧', '含手续费'", () => {
    for (const t of ["Scratch the deadline, no rush. Just keep it under the ceiling.", "帮我 buy 1,000 USDT of rSPY, ceiling 照旧。", "买 300 USDT rHIMS，含手续费总成本不能超过 5 个基点。"]) {
      const f = checkFields(t.includes("5 个基点") ? [{ name: "ceilingBps", value: 5, span: "总成本不能超过 5 个基点" }] : [], t, D, UNI);
      expect(f.filter((x) => x.note === "mentioned but not read").map((x) => x.name)).toEqual([]);
    }
  });
});

describe("contradictions are restatements, not distinctions (development)", () => {
  const UNI = [{ code: "COIN", symbol: "RCOINUSDT" }, { code: "MSTR", symbol: "RMSTRUSDT" }, { code: "AMZN", symbol: "RAMZNUSDT" }];
  const D = "2026-10-07";
  it.each([
    ["Selling 75 rCOIN. Fees on my tier: maker 0.02%, taker 0.06%.", 6, "taker 0.06%"],
    ["My buddy pays 4bp taker on his VIP account, I'm on the regular 10bp.", 10, "regular 10bp"],
    ["Bitget default taker 是 0.1%, 但我用 BGB 抵扣, 实际付 0.08%.", 8, "实际付 0.08%"],
    ["卖出 rAMZN 25 股，手续费千分之一，哦不对，我刚升了VIP，现在吃单是万分之七。", 7, "现在吃单是万分之七"],
  ])("%s keeps the trader's own fee", (text, value, span) => {
    expect(checkFields([{ name: "takerFeeBps", value: value as number, span: span as string }], text as string, D, UNI).find((x) => x.name === "takerFeeBps")?.status).toBe("accepted");
  });
  it("'6 bps, which is 0.1%' and '6 or 10 bps' are still asked", () => {
    for (const t of ["My taker fee is 6 bps, which is 0.1%.", "taker fee 6 bps or 0.1%, not sure"]) expect(checkFields([{ name: "takerFeeBps", value: 6, span: "6 bps" }], t, D, UNI).find((x) => x.name === "takerFeeBps")?.status).toBe("conflict");
  });
  it("'今天跌了8%' is not a deadline", () => {
    expect(checkFields([], "rMSTR 今天跌了8%，我想抄底买 2000 USDT 的。", D, UNI).find((x) => x.name === "hardDeadlineNy")).toBeUndefined();
  });
});

describe("someone else's fee, and an undecided choice (development)", () => {
  const UNI = [{ code: "AMD", symbol: "RAMDUSDT" }, { code: "SPY", symbol: "RSPYUSDT" }];
  const D = "2026-10-03";
  it("a fee quoted from someone else's clause is never used", () => {
    const t = "rAMD 跌了 3%，想 buy 200 USDT worth，我老婆账户 taker 是 5bp，我的是 10bp";
    expect(checkFields([{ name: "takerFeeBps", value: 5, span: "我老婆账户 taker 是 5bp" }], t, D, UNI).find((x) => x.name === "takerFeeBps")?.status).toBe("conflict");
    expect(checkFields([{ name: "takerFeeBps", value: 10, span: "我的是 10bp" }], t, D, UNI).find((x) => x.name === "takerFeeBps")?.status).toBe("accepted");
    expect(checkFields([{ name: "takerFeeBps", value: 4, span: "4bp taker" }], "My buddy pays 4bp taker on his VIP account, I'm on the regular 10bp.", D, UNI).find((x) => x.name === "takerFeeBps")?.status).toBe("conflict");
  });
  it("'20 还是 25' and '20 or 25' are an undecided choice, asked back", () => {
    for (const [t, span] of [["buy 1000U rSPY, ceiling 改成 20 还是 25…我还没想好", "ceiling 改成 20"], ["buy 1000 USDT of rSPY, ceiling 20 or 25 bps", "ceiling 20"]]) {
      expect(checkFields([{ name: "ceilingBps", value: 20, span }], t, D, UNI).find((x) => x.name === "ceilingBps")?.status).toBe("conflict");
    }
  });
});
