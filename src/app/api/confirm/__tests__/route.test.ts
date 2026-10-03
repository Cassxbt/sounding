import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "../route";
import { POST as SOUND } from "../../sound/route";

const soundBody = { symbol: "RHIMSUSDT", side: "sell", amount: "178.4121", ceilingBps: 50, userFeeBps: 8, mode: "recorded", fixture: "RHIMSUSDT@20261003a" };
const post = (handler: (r: Request) => Promise<Response>, body: string, url = "http://x/api") => handler(new Request(url, { method: "POST", headers: { "content-type": "application/json" }, body }));
async function decision() {
  const r = await post(SOUND, JSON.stringify(soundBody));
  const j = await r.json();
  return j.result ?? j;
}
const confirm = (original: unknown, extra: Record<string, unknown> = {}) => post(POST, JSON.stringify({ original, mode: "recorded", freshFixture: "RHIMSUSDT@20261003b", ...extra }));

afterEach(() => { vi.restoreAllMocks(); delete process.env.SOUNDING_RECEIPT_KEY; });

describe("/api/confirm", () => {
  it("recorded pair 21 s apart stands", async () => {
    process.env.SOUNDING_RECEIPT_KEY = "route-test";
    const r = await confirm(await decision());
    expect(r.status).toBe(200);
    expect((await r.json()).look.status).toBe("STANDS_ON_FRESH_BOOK");
  });
  it("tampered receipt -> 422 before any book is fetched", async () => {
    process.env.SOUNDING_RECEIPT_KEY = "route-test";
    const o = await decision(); o.receipt.ceilingBps = 500;
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const r = await confirm(o, { mode: "live" });
    expect(r.status).toBe(422);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("recorded decision on a live book -> 422 before any fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const r = await confirm(await decision(), { mode: "live" });
    expect(r.status).toBe(422);
    expect((await r.json()).error).toMatch(/recorded decision cannot be confirmed on a live book/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("confirming book older than the decision -> 422", async () => {
    expect((await confirm(await decision(), { freshFixture: "RHIMSUSDT" })).status).toBe(422);
  });
  it("oversized body -> 413, counted in bytes", async () => {
    const o = await decision();
    const r = await post(POST, JSON.stringify({ original: o, mode: "recorded", pad: "é".repeat(300_000) }));
    expect(r.status).toBe(413);
  });
  it("non-JSON -> 400; missing receipt -> 400", async () => {
    expect((await post(POST, "not json")).status).toBe(400);
    expect((await post(POST, JSON.stringify({ original: {} }))).status).toBe(400);
  });
});
