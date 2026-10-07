import { describe, expect, it } from "vitest";
import { deletionTest } from "../deletion";

describe("deletion test: every sponsor input is load-bearing", () => {
  it("with everything: the lead order is within at the stated fee", async () => {
    const t = await deletionTest();
    expect(t.baseline).toMatchObject({ ok: true, allInBps: "39.86", within: true });
  });
  it("removing any Bitget input refuses the order with a named gate", async () => {
    const { rows } = await deletionTest();
    const code = (id: string) => rows.find((r) => r.id === id)!.without.code;
    expect(code("book")).toBe("NO_EXECUTABLE_QUOTE");
    expect(code("stockInfo")).toBe("INVALID_INSTRUMENT");
    expect(code("session")).toBe("SESSION_UNKNOWN");
    expect(code("instruments")).toBe("INVALID_INSTRUMENT");
  });
  it("removing Qwen: the regex reader misses the fee and the deadline, and a trade that fits is refused", async () => {
    const t = await deletionTest();
    expect(t.regexRead).toMatchObject({ fee: null, deadline: null });
    const q = t.rows.find((r) => r.id === "qwen")!;
    expect(q.with).toMatchObject({ ok: true, allInBps: "39.86", within: true });
    expect(q.without).toMatchObject({ ok: true, allInBps: "51.83", within: false });
  });
});
