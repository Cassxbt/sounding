import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { sound } from "@/engine";
import { templateAnalysis } from "../template";
import { relevantEvidenceIds, validate } from "../rules";
import { EMPTY_CONSTRAINTS, replyLanguage } from "..";
import type { EvidencePack } from "../schema";
import { calendar, instruments, rhims, states, stockInfo, T_RHIMS } from "@/engine/__tests__/helpers";

const evidence = (): EvidencePack => JSON.parse(readFileSync("fixtures/evidence/RHIMSUSDT.json", "utf8"));
const ctx = () => ({ stockInfo: stockInfo(), states: states(), calendar: calendar(), instruments: instruments(), historical: true, now: T_RHIMS });
const C = (o: Partial<typeof EMPTY_CONSTRAINTS>) => ({ ...EMPTY_CONSTRAINTS, ...o });
// A 40 bps ceiling: within at Bitget's published 5 bps rToken fee (36.87), over at the 10 bps list rate (41.86).
const turn1 = (fee?: number) => sound({ ...ctx(), capture: rhims(), intent: { side: "sell", baseQty: "178.4121" }, ceilingBps: 40, userFeeBps: fee });
const turn2 = () => sound({ ...ctx(), capture: rhims(), intent: { side: "sell", baseQty: "35" }, ceilingBps: 40 });

describe("the next session is never the recommendation: Bitget routes it to the US market, which the engine does not price", () => {
  const over = () => sound({ ...ctx(), capture: rhims(), intent: { side: "sell", baseQty: "178.4121" }, ceilingBps: 30, userFeeBps: 5 });
  it("no hard exit, full size over the ceiling: the partial that fits is recommended, waiting stays an option", () => {
    const out = templateAnalysis(over(), evidence(), C({ takerFeeBps: 5 }));
    expect(out.recommendation).toBe("largest_within_ceiling");
    expect(out.admissible.map((a) => a.kind)).toContain("requote_at_switch");
    expect(validate(out, over(), evidence())).toEqual([]);
  });
  it("a model answer recommending it is replaced", () => {
    const out = templateAnalysis(over(), evidence(), C({ takerFeeBps: 5 }));
    expect(validate({ ...out, recommendation: "requote_at_switch" }, over(), evidence()).map((v) => v.rule)).toContain("unpriced_alternative");
  });
});

describe("template analyst on the lead demo", () => {
  it("turn 1: fee-sensitive -> asks for the fee, no recommendation, hard deadline excludes limit and partial", () => {
    const c = C({ thesis: "GLP-1", hardDeadlineNy: "2026-10-08", mustBeFlat: true });
    const out = templateAnalysis(turn1(), evidence(), c);
    expect(out.clarification).toMatch(/taker fee/);
    expect(out.recommendation).toBeNull();
    expect(out.excluded.map((e) => e.kind)).toEqual(expect.arrayContaining(["resting_limit", "largest_within_ceiling"]));
    expect(out.admissible.map((a) => a.kind)).toContain("requote_at_switch"); // Oct 8 is well after Monday's switch
    expect(out.evidence.find((e) => e.recordId === "hims-cao-departure-2026")!.relevant).toBe(true);
    expect(validate(out, turn1(), evidence())).toEqual([]);
  });
  it("turn 1 with fee 8 bps stated -> immediate cross admissible and recommended", () => {
    const c = C({ hardDeadlineNy: "2026-10-08", mustBeFlat: true, takerFeeBps: 8 });
    const out = templateAnalysis(turn1(8), evidence(), c);
    expect(out.clarification).toBeNull();
    expect(out.recommendation).toBe("immediate_cross");
    expect(validate(out, turn1(8), evidence())).toEqual([]);
  });
  it("turn 2 (35 sh): within at all scenarios -> recommends immediate cross, explains the change", () => {
    const c = C({ hardDeadlineNy: "2026-10-08", mustBeFlat: true });
    const prev = templateAnalysis(turn1(), evidence(), c);
    const out = templateAnalysis(turn2(), evidence(), c, prev);
    expect(out.recommendation).toBe("immediate_cross");
    expect(out.changedBecause).toMatch(/changed from none to immediate_cross/);
    expect(validate(out, turn2(), evidence())).toEqual([]);
  });
  it("hard exit with nothing within ceiling -> no recommendation, says no priced route exits", () => {
    // 40 bps ceiling, 20 bps stated fee: full size is over; re-quote must not become the recommendation
    const res = turn1(20);
    const out = templateAnalysis(res, evidence(), C({ hardDeadlineNy: "2026-10-08", mustBeFlat: true, takerFeeBps: 20 }));
    expect(out.recommendation).toBeNull();
    expect(out.bindingConstraint).toMatch(/no priced route exits the full position/);
    expect(validate(out, res, evidence())).toEqual([]);
  });
  it("turn 3: deadline removed -> resting limit and partial become admissible (on the fee-sensitive book)", () => {
    const out = templateAnalysis(turn1(8), evidence(), C({ takerFeeBps: 8 }));
    expect(out.admissible.map((a) => a.kind)).toEqual(expect.arrayContaining(["resting_limit", "requote_at_switch", "immediate_cross"]));
    const noFee = templateAnalysis(turn1(), evidence(), C({}));
    expect(noFee.admissible.map((a) => a.kind)).toContain("largest_within_ceiling");
  });
  it("deadline ON the event day with unknown time -> clarification required", () => {
    const c = C({ hardDeadlineNy: "2026-10-09", mustBeFlat: true, takerFeeBps: 8 });
    const out = templateAnalysis(turn1(8), evidence(), c);
    expect(out.clarification).toMatch(/no published time/);
    expect(validate(out, turn1(8), evidence())).toEqual([]);
  });
});

describe("validator catches compliant-but-bad answers", () => {
  const base = () => templateAnalysis(turn1(8), evidence(), C({ hardDeadlineNy: "2026-10-08", mustBeFlat: true, takerFeeBps: 8 }));
  it("recommending a resting limit under a hard deadline", () => {
    const bad = { ...base(), recommendation: "resting_limit" as const };
    expect(validate(bad, turn1(8), evidence()).map((v) => v.rule)).toContain("hard_constraint");
  });
  it("marking the calendar-check record (undated) as relevant", () => {
    const bad = { ...base(), evidence: base().evidence.map((e) => e.recordId === "hims-events-calendar-2026-09-20" ? { ...e, relevant: true } : e) };
    expect(validate(bad, turn1(8), evidence()).map((v) => v.rule)).toContain("irrelevant_evidence_used");
  });
  it("inventing a bps number", () => {
    const bad = { ...base(), explanation: "Cost is about 12 bps so go ahead." };
    expect(validate(bad, turn1(8), evidence()).map((v) => v.rule)).toContain("invented_number");
  });
  it("silently recommending while FEE_SENSITIVE and fee unknown", () => {
    const out = templateAnalysis(turn1(), evidence(), C({ hardDeadlineNy: "2026-10-08", mustBeFlat: true }));
    const bad = { ...out, clarification: null, recommendation: "immediate_cross" as const };
    expect(validate(bad, turn1(), evidence()).map((v) => v.rule)).toContain("fee_sensitive_needs_fee");
  });
  it("recommending re-quote under a hard exit", () => {
    const bad = { ...base(), recommendation: "requote_at_switch" as const };
    expect(validate(bad, turn1(8), evidence()).map((v) => v.rule)).toContain("hard_constraint");
  });
  it("describing re-quote as satisfying the hard exit (Qwen's turn-1 wording)", () => {
    const bad = { ...base(), admissible: base().admissible.map((a) => a.kind === "requote_at_switch" ? { ...a, reason: "Defers to next US session; still before Oct 8 deadline, preserving must-be-flat constraint" } : a) };
    expect(validate(bad, turn1(8), evidence()).map((v) => v.rule)).toContain("overclaim_plan_step");
  });
  it("tighten-only: the analyst may not relax a stated fee, deadline or must-be-flat", () => {
    const stated = C({ hardDeadlineNy: "2026-10-08", mustBeFlat: true, takerFeeBps: 8 });
    const looser = { ...base(), constraints: { ...base().constraints, takerFeeBps: 5, mustBeFlat: false, hardDeadlineNy: "2026-10-20" } };
    const rules = validate(looser, turn1(8), evidence(), stated).filter((x) => x.rule === "loosened_constraint");
    expect(rules).toHaveLength(3);
    const stricter = { ...base(), constraints: { ...base().constraints, hardDeadlineNy: "2026-10-06" } };
    expect(validate(stricter, turn1(8), evidence(), stated).map((x) => x.rule)).not.toContain("loosened_constraint");
  });
  it("promise language in a reason", () => {
    const bad = { ...base(), admissible: [{ kind: "requote_at_switch" as const, reason: "guarantees fill certainty at the open" }] };
    expect(validate(bad, turn1(8), evidence()).map((v) => v.rule)).toContain("promise_language");
  });
  it("leaving a priced alternative unclassified", () => {
    const bad = { ...base(), admissible: base().admissible.filter((a) => a.kind !== "immediate_cross"), excluded: base().excluded.filter((a) => a.kind !== "immediate_cross") };
    expect(validate(bad, turn1(8), evidence()).map((v) => v.rule)).toContain("unclassified_alternative");
  });
  it("unpriced alternative", () => {
    const bad = { ...base(), recommendation: "requote_at_switch" as const, admissible: [{ kind: "requote_at_switch" as const, reason: "x" }] };
    // requote_at_switch IS priced; construct an impossible one by faking the engine list
    const res = turn1(8); res.alternatives = res.alternatives!.filter((a) => a.kind !== "requote_at_switch");
    expect(validate(bad, res, evidence()).map((v) => v.rule)).toContain("unpriced_alternative");
  });
});

describe("tighten-only: the fee is a fact", () => {
  it("a fee the trader never stated is an invented constraint", () => {
    const out = templateAnalysis(turn1(8), evidence(), C({ takerFeeBps: 8 }));
    const invented = { ...out, constraints: { ...out.constraints, takerFeeBps: 5 } };
    expect(validate(invented, turn1(8), evidence(), C({})).map((v) => v.rule)).toContain("invented_constraint");
  });
});

describe("clip row: priced now, remainder unpriced", () => {
  it("at a 20 bps fee the clip is the largest size within the ceiling and states its remainder", () => {
    const res = turn1(20);
    const clip = res.alternatives!.find((a) => a.kind === "largest_within_ceiling")!;
    expect(clip.qty).toBe("77.7155");
    expect(clip.remainder).toBe("100.6966");
    expect(Number(clip.allInBpsByFee![20])).toBeLessThanOrEqual(40);
    expect(clip.tradeoffs.join(" ")).toMatch(/remainder 100.6966 sh unpriced/);
  });
  it("hard exit: the clip is excluded whatever the deadline, and a model admitting it is flagged", () => {
    for (const d of ["2026-09-21", "2026-10-08"]) {
      const out = templateAnalysis(turn1(20), evidence(), C({ hardDeadlineNy: d, mustBeFlat: true, takerFeeBps: 20 }));
      expect(out.excluded.map((e) => e.kind)).toContain("largest_within_ceiling");
      expect(out.recommendation).toBeNull();
      expect(validate(out, turn1(20), evidence())).toEqual([]);
      const bad = { ...out, admissible: [...out.admissible, { kind: "largest_within_ceiling" as const, reason: "x" }], excluded: out.excluded.filter((e) => e.kind !== "largest_within_ceiling") };
      expect(validate(bad, turn1(20), evidence()).map((v) => v.detail).join(" ")).toMatch(/does not exit the full position/);
    }
  });
  it("no hard exit: the clip is admissible", () => {
    const out = templateAnalysis(turn1(20), evidence(), C({ takerFeeBps: 20 }));
    expect(out.admissible.map((a) => a.kind)).toContain("largest_within_ceiling");
  });
  it("a remainder too small to trade on its own is named", () => {
    const res = sound({ ...ctx(), capture: rhims(), intent: { side: "sell", baseQty: "148.81" }, ceilingBps: 50, userFeeBps: 20 });
    const clip = res.alternatives!.find((a) => a.kind === "largest_within_ceiling")!;
    expect(clip.remainder).toBe("0.1391");
    expect(clip.tradeoffs.join(" ")).toMatch(/below the 10 USDT minimum order/);
    expect(turn1(20).alternatives!.find((a) => a.kind === "largest_within_ceiling")!.tradeoffs.join(" ")).not.toMatch(/minimum order/);
  });
});

describe("reply voice", () => {
  it("promise language is caught in Chinese too", () => {
    const out = templateAnalysis(turn1(8), evidence(), C({ takerFeeBps: 8 }));
    for (const s of ["这笔订单保证成交。", "现在卖出是无风险的。", "一定会成交"]) {
      expect(validate({ ...out, explanation: s }, turn1(8), evidence()).map((v) => v.rule)).toContain("promise_language");
    }
  });
  it("the template speaks to the trader: no field names, no snake_case, leads with the answer", () => {
    const out = templateAnalysis(turn1(8), evidence(), C({ takerFeeBps: 8, hardDeadlineNy: "2026-10-07", mustBeFlat: true }));
    expect(out.explanation).not.toMatch(/_|mustBeFlat|hardDeadline/);
    expect(out.explanation).toMatch(/^Cross now at full size: 39\.86 bps all-in/);
    expect(validate(out, turn1(8), evidence())).toEqual([]);
  });
});

describe("reply language is decided by code", () => {
  it("reads the trader's language from their message", () => {
    expect(replyLanguage("Sell 178.4121 rHIMS. I pay 0.08% taker, out before the 8th.")).toBe("en");
    expect(replyLanguage("卖出178.4121股rHIMS，吃单手续费千分之0.8，8号之前必须清仓。")).toBe("zh");
    expect(replyLanguage("sell 178.4121 rHIMS, taker 万8, all-in 不超过 50bp, before the 8th 必须 flat")).toBe("en");
  });
  it("a reply in the wrong language is a violation", () => {
    const out = templateAnalysis(turn1(8), evidence(), C({ takerFeeBps: 8 }));
    expect(validate({ ...out, explanation: "立即吃单卖出，总成本为39.86 bps，在50 bps上限内。" }, turn1(8), evidence(), undefined, "en").map((v) => v.rule)).toContain("reply_language");
    expect(validate(out, turn1(8), evidence(), undefined, "zh").map((v) => v.rule)).toContain("reply_language");
    expect(validate(out, turn1(8), evidence(), undefined, "en").map((v) => v.rule)).not.toContain("reply_language");
  });
});

describe("route admissibility is owned by the engine", () => {
  const over = () => turn1(20);
  it("recommending a cross the engine prices over the ceiling is a violation (partner repro: 51.83 > 50)", () => {
    const t = templateAnalysis(over(), evidence(), C({ takerFeeBps: 20 }));
    const bad = { ...t, recommendation: "immediate_cross" as const, admissible: [...t.admissible.filter((a) => a.kind !== "immediate_cross"), { kind: "immediate_cross" as const, reason: "cross now" }], excluded: t.excluded.filter((e) => e.kind !== "immediate_cross") };
    const rules = validate(bad, over(), evidence(), C({ takerFeeBps: 20 })).map((v) => v.rule);
    expect(rules).toContain("route_not_admissible");
  });
  it("admitting an over-ceiling cross without recommending it is still a violation", () => {
    const t = templateAnalysis(over(), evidence(), C({ takerFeeBps: 20 }));
    const bad = { ...t, admissible: [...t.admissible, { kind: "immediate_cross" as const, reason: "x" }], excluded: t.excluded.filter((e) => e.kind !== "immediate_cross") };
    expect(validate(bad, over(), evidence(), C({ takerFeeBps: 20 })).map((v) => v.rule)).toContain("route_not_admissible");
  });
  it("a recommendation must be one of the admissible routes, and no route may be both", () => {
    const t = templateAnalysis(turn1(8), evidence(), C({ takerFeeBps: 8 }));
    const notListed = { ...t, admissible: t.admissible.filter((a) => a.kind !== "immediate_cross"), excluded: [...t.excluded, { kind: "immediate_cross" as const, reason: "x" }], recommendation: "immediate_cross" as const };
    expect(validate(notListed, turn1(8), evidence(), C({ takerFeeBps: 8 })).map((v) => v.rule)).toContain("recommendation_not_admissible");
    const both = { ...t, excluded: [...t.excluded, { kind: "immediate_cross" as const, reason: "x" }] };
    expect(validate(both, turn1(8), evidence(), C({ takerFeeBps: 8 })).map((v) => v.rule)).toContain("contradictory_classification");
  });
  it("the template passes its own admissibility rules at every fee and deadline state", () => {
    for (const fee of [0, 8, 10, 20]) for (const dl of [null, "2026-09-21", "2026-10-07"]) {
      const res = turn1(fee);
      const c = C({ takerFeeBps: fee, hardDeadlineNy: dl, mustBeFlat: !!dl });
      expect(validate(templateAnalysis(res, evidence(), c), res, evidence(), c)).toEqual([]);
    }
  });
});

describe("evidence must be ahead of the decision, not behind it", () => {
  const pack = (date: string) => ({ ...evidence(), records: [{ ...evidence().records[0], id: "ev", effective_date_ny: date }] });
  it("an event before the book's date is never relevant", () => {
    expect(relevantEvidenceIds(pack("2026-09-15"), C({}), "2026-09-20").relevant).toEqual([]);
  });
  it("with no deadline, only events within the 14-day horizon are relevant", () => {
    expect(relevantEvidenceIds(pack("2026-09-30"), C({}), "2026-09-20").relevant).toEqual(["ev"]);
    expect(relevantEvidenceIds(pack("2026-10-20"), C({}), "2026-09-20").relevant).toEqual([]);
  });
  it("a model that marks a past event relevant is flagged", () => {
    const res = turn1(8);
    const pk = pack("2026-09-15");
    const out = templateAnalysis(res, pk, C({ takerFeeBps: 8 }));
    const bad = { ...out, evidence: [{ recordId: "ev", relevant: true, reason: "x" }] };
    expect(validate(bad, res, pk, C({ takerFeeBps: 8 })).map((v) => v.rule)).toContain("irrelevant_evidence_used");
  });
});

describe("invented numbers are caught in Chinese units too", () => {
  it("'12个基点' and '12 基点' are checked like '12 bps'", () => {
    const out = templateAnalysis(turn1(8), evidence(), C({ takerFeeBps: 8 }));
    for (const e of ["总成本为12个基点。", "总成本 12 基点"]) expect(validate({ ...out, explanation: e }, turn1(8), evidence()).map((v) => v.rule)).toContain("invented_number");
    expect(validate({ ...out, explanation: "总成本为39.86个基点。" }, turn1(8), evidence()).map((v) => v.rule)).not.toContain("invented_number");
  });
});

describe("a cross is an opportunity, not an achieved exit", () => {
  it("claiming the cross satisfies the hard exit is flagged, in English and Chinese", () => {
    const c = C({ takerFeeBps: 8, hardDeadlineNy: "2026-10-07", mustBeFlat: true });
    const out = templateAnalysis(turn1(8), evidence(), c);
    for (const reason of ["Crossing now satisfies your must-be-flat deadline.", "立即吃单满足清仓要求。", "This gets you flat before the deadline."]) {
      const bad = { ...out, admissible: out.admissible.map((a) => (a.kind === "immediate_cross" ? { ...a, reason } : a)) };
      expect(validate(bad, turn1(8), evidence(), c).map((v) => v.rule)).toContain("overclaim_plan_step");
    }
  });
});

describe("every figure in every field is the engine's (third review)", () => {
  const out = () => templateAnalysis(turn1(8), evidence(), C({ takerFeeBps: 8 }));
  const rules = (o: ReturnType<typeof out>) => validate(o, turn1(8), evidence()).map((v) => v.rule);
  it.each(["Cost is 999 bp.", "Cost is 9.99%.", "Cost is 999 BPS.", "Cost is 999 basis points.", "Cost is -39.86 bps."])("explanation %s is caught", (e) => {
    expect(rules({ ...out(), explanation: e })).toContain("invented_number");
  });
  it("a figure in the binding constraint or a route reason is checked like the explanation", () => {
    expect(rules({ ...out(), bindingConstraint: "Your 999 bps ceiling." })).toContain("invented_number");
    const o = out();
    expect(rules({ ...o, admissible: o.admissible.map((a) => ({ ...a, reason: "Costs 999 bps." })), excluded: o.excluded.map((a) => ({ ...a, reason: "Costs 999 bps." })) })).toContain("invented_number");
  });
  it("engine figures in any unit still pass", () => {
    expect(rules({ ...out(), explanation: "39.86 bps all-in, 0.4% ceiling, 8 basis points fee." })).not.toContain("invented_number");
  });
});

describe("the fallback answers in the trader's language (third review)", () => {
  it("a Chinese message gets a Chinese template that passes every rule, Chinese ones included", () => {
    for (const fee of [8, 20]) {
      const c = C({ takerFeeBps: fee });
      const out = templateAnalysis(turn1(fee), evidence(), c, undefined, "zh");
      expect(out.explanation).toMatch(/[一-鿿]/);
      expect(out.bindingConstraint).toMatch(/[一-鿿]/);
      expect(validate(out, turn1(fee), evidence(), c, "zh")).toEqual([]);
    }
  });
  it("English stays the default", () => {
    expect(templateAnalysis(turn1(8), evidence(), C({ takerFeeBps: 8 })).explanation).toMatch(/^Cross now/);
  });
});

describe("figures are checked at the precision they are written in", () => {
  const out = () => templateAnalysis(turn1(8), evidence(), C({ takerFeeBps: 8 }));
  const rules = (e: string) => validate({ ...out(), explanation: e }, turn1(8), evidence()).map((v) => v.rule);
  it("a rounded engine figure passes", () => {
    for (const e of ["about 0.37% all-in at 5 bps", "roughly 36.9 bps", "about 40 bps all-in"]) expect(rules(e)).not.toContain("invented_number");
  });
  it("a figure with thousands separators is read whole", () => expect(rules("Costs 1,000 bps.")).toContain("invented_number"));
});

describe("Chinese cost words are checked like digits", () => {
  const out = () => templateAnalysis(turn1(8), evidence(), C({ takerFeeBps: 8 }), undefined, "zh");
  const rules = (e: string) => validate({ ...out(), explanation: e }, turn1(8), evidence(), undefined, "zh").map((v) => v.rule);
  it("an engine figure in words passes", () => {
    for (const e of ["全部成本约百分之零点三七。", "上限是千分之四。"]) expect(rules(e)).not.toContain("invented_number");
  });
  it("an invented figure in words is caught", () => {
    for (const e of ["成本是百分之九十九。", "成本是千分之九。", "成本万二十"]) expect(rules(e)).toContain("invented_number");
  });
});

describe("a negated exit claim is not an overclaim", () => {
  const c = C({ hardDeadlineNy: "2026-10-08", mustBeFlat: true, takerFeeBps: 20 });
  const out = () => templateAnalysis(turn1(20), evidence(), c);
  const rules = (e: string) => validate({ ...out(), explanation: e }, turn1(20), evidence()).map((v) => v.rule);
  it.each(["No priced route satisfies the hard exit on this snapshot.", "Nothing here gets you flat by the deadline.", "Crossing does not satisfy your hard exit.", "当前没有任何路线能满足清仓要求。"])("passes: %s", (e) => expect(rules(e)).not.toContain("overclaim_plan_step"));
  it.each(["Crossing now satisfies your hard exit.", "This gets you flat by Oct 8.", "此路线满足清仓要求。"])("still caught: %s", (e) => expect(rules(e)).toContain("overclaim_plan_step"));
});

describe("the change note is checked like every other field", () => {
  it("an invented figure or a promise in changedBecause is caught", () => {
    const out = templateAnalysis(turn1(8), evidence(), C({ takerFeeBps: 8 }));
    expect(validate({ ...out, changedBecause: "the cost fell to 3 bps" }, turn1(8), evidence()).map((v) => v.rule)).toContain("invented_number");
    expect(validate({ ...out, changedBecause: "now guaranteed to fill" }, turn1(8), evidence()).map((v) => v.rule)).toContain("promise_language");
  });
});
