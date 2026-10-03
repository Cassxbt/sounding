import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { sound } from "@/engine";
import { templateAnalysis } from "../template";
import { validate } from "../rules";
import { EMPTY_CONSTRAINTS } from "..";
import type { EvidencePack } from "../schema";
import { calendar, instruments, rhims, states, stockInfo, T_RHIMS } from "@/engine/__tests__/helpers";

const evidence = (): EvidencePack => JSON.parse(readFileSync("fixtures/evidence/RHIMSUSDT.json", "utf8"));
const ctx = () => ({ stockInfo: stockInfo(), states: states(), calendar: calendar(), instruments: instruments(), historical: true, now: T_RHIMS });
const C = (o: Partial<typeof EMPTY_CONSTRAINTS>) => ({ ...EMPTY_CONSTRAINTS, ...o });
const turn1 = (fee?: number) => sound({ ...ctx(), capture: rhims(), intent: { side: "sell", baseQty: "178.4121" }, ceilingBps: 50, userFeeBps: fee });
const turn2 = () => sound({ ...ctx(), capture: rhims(), intent: { side: "sell", baseQty: "35" }, ceilingBps: 50 });

describe("template analyst on the lead demo", () => {
  it("turn 1: fee-sensitive -> asks for the fee, no recommendation, hard deadline excludes the limit; the clip is a plan step only", () => {
    const c = C({ thesis: "GLP-1", hardDeadlineNy: "2026-10-08", mustBeFlat: true });
    const out = templateAnalysis(turn1(), evidence(), c);
    expect(out.clarification).toMatch(/taker fee/);
    expect(out.recommendation).toBeNull();
    expect(out.excluded.map((e) => e.kind)).toContain("resting_limit");
    expect(out.admissible.find((a) => a.kind === "largest_within_ceiling")!.reason).toMatch(/plan step.*remainder is unpriced/);
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
    // 50 bps ceiling, 20 bps stated fee: full size is over; re-quote must not become the recommendation
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
    expect(clip.qty).toBe("147.8609");
    expect(clip.remainder).toBe("30.5512");
    expect(Number(clip.allInBpsByFee![20])).toBeLessThanOrEqual(50);
    expect(clip.tradeoffs.join(" ")).toMatch(/remainder 30.5512 sh unpriced/);
  });
  it("hard deadline before the next session: the clip is excluded, and a model admitting it is flagged", () => {
    const c = C({ hardDeadlineNy: "2026-09-21", mustBeFlat: true, takerFeeBps: 20 });
    const out = templateAnalysis(turn1(20), evidence(), c);
    expect(out.excluded.map((e) => e.kind)).toContain("largest_within_ceiling");
    expect(out.recommendation).toBeNull();
    expect(validate(out, turn1(20), evidence())).toEqual([]);
    const bad = { ...out, admissible: [...out.admissible, { kind: "largest_within_ceiling" as const, reason: "x" }], excluded: out.excluded.filter((e) => e.kind !== "largest_within_ceiling") };
    expect(validate(bad, turn1(20), evidence()).map((v) => v.detail).join(" ")).toMatch(/partial leaves a remainder/);
  });
  it("hard deadline after the next session: admissible as a plan step, never the recommendation", () => {
    const c = C({ hardDeadlineNy: "2026-10-08", mustBeFlat: true, takerFeeBps: 20 });
    const out = templateAnalysis(turn1(20), evidence(), c);
    expect(out.admissible.map((a) => a.kind)).toContain("largest_within_ceiling");
    expect(out.recommendation).toBeNull();
    expect(validate(out, turn1(20), evidence())).toEqual([]);
  });
});
