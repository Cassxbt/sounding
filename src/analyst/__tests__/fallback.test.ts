import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { sound } from "@/engine";
import { templateAnalysis } from "../template";
import type { EvidencePack } from "../schema";
import { calendar, instruments, rhims, states, stockInfo, T_RHIMS } from "@/engine/__tests__/helpers";

const loosenedReply = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("../qwen", async (orig) => ({
  ...(await orig<typeof import("../qwen")>()),
  qwenAvailable: () => true,
  qwenAnalyze: async () => ({ parsed: loosenedReply.value }),
}));

const { runAnalyst, EMPTY_CONSTRAINTS } = await import("..");

describe("analyst fallback", () => {
  it("a rejected model answer falls back on the checked constraints, not the model's loosened ones", async () => {
    const evidence: EvidencePack = JSON.parse(readFileSync("fixtures/evidence/RHIMSUSDT.json", "utf8"));
    const result = sound({ stockInfo: stockInfo(), states: states(), calendar: calendar(), instruments: instruments(), historical: true, now: T_RHIMS, capture: rhims(), intent: { side: "sell", baseQty: "178.4121" }, ceilingBps: 50, userFeeBps: 8 });
    const stated = { ...EMPTY_CONSTRAINTS, takerFeeBps: 8, hardDeadlineNy: "2026-10-08", mustBeFlat: true };
    const good = templateAnalysis(result, evidence, stated);
    loosenedReply.value = { ...good, constraints: { ...good.constraints, mustBeFlat: false, hardDeadlineNy: null } };
    const r = await runAnalyst({ result, evidence, turns: [], constraints: stated });
    expect(r.producedBy).toBe("template");
    expect(r.violations.map((v) => v.rule)).toContain("loosened_constraint");
    expect(r.output.constraints).toMatchObject({ mustBeFlat: true, hardDeadlineNy: "2026-10-08", takerFeeBps: 8 });
  });
});
