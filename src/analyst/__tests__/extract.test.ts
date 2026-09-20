import { describe, expect, it } from "vitest";
import { extractConstraints } from "../extract";
import { EMPTY_CONSTRAINTS as E } from "..";

describe("deterministic constraint extraction (template arm)", () => {
  it("lead demo sentence", () => {
    const r = extractConstraints("Sell 178.412132 rHIMS now. Ceiling 50 bps all-in. I hold this on the GLP-1 thesis; I must be flat before the CAO transition takes effect on October 9, so hard deadline October 8.", E);
    expect(r.constraints.mustBeFlat).toBe(true);
    expect(r.constraints.hardDeadlineNy).toBe("2026-10-08");
    expect(r.constraints.thesis).toBe("GLP-1");
    expect(r.sizeShares).toBe("178.412132");
  });
  it("fee, size change, release of deadline", () => {
    expect(extractConstraints("My taker fee is 8 bps.", E).constraints.takerFeeBps).toBe(8);
    expect(extractConstraints("Make it 35 shares.", E).sizeShares).toBe("35");
    const rel = extractConstraints("Actually I can hold through the transition.", { ...E, mustBeFlat: true, hardDeadlineNy: "2026-10-08" });
    expect(rel.constraints.mustBeFlat).toBe(false); expect(rel.constraints.hardDeadlineNy).toBeNull();
  });
  it("does not invent: unknowns stay unknown", () => {
    const r = extractConstraints("What does it cost?", E);
    expect(r.constraints).toEqual(E); expect(r.sizeShares).toBeUndefined();
  });
});
