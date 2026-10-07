import { describe, expect, it } from "vitest";
import { deletionTest } from "../deletion";

describe("deletion test: every sponsor input is load-bearing", () => {
  it("with everything: the lead order is priced on the trader's own fee and ceiling, and is over at full size", async () => {
    const t = await deletionTest();
    expect(t.baseline).toMatchObject({ ok: true, allInBps: "36.87", within: false });
  });
  it("removing any Bitget input refuses the order with a named gate", async () => {
    const { rows } = await deletionTest();
    const code = (id: string) => rows.find((r) => r.id === id)!.without.code;
    expect(code("book")).toBe("NO_EXECUTABLE_QUOTE");
    expect(code("stockInfo")).toBe("INVALID_INSTRUMENT");
    expect(code("session")).toBe("SESSION_UNKNOWN");
    expect(code("instruments")).toBe("INVALID_INSTRUMENT");
  });
  it("removing Qwen: the regex reader cannot read the fee, ceiling or deadline, so it asks instead of answering", async () => {
    const t = await deletionTest();
    expect(t.regexRead).toMatchObject({ fee: null, ceiling: null, deadline: null });
    const q = t.rows.find((r) => r.id === "qwen")!;
    expect(q.with).toMatchObject({ ok: true, allInBps: "36.87", within: false });
    expect(q.without).toMatchObject({ ok: false, headline: "Asked, not answered" });
    expect(q.without.detail).toMatch(/taker fee|cost ceiling|deadline/);
  });
});
