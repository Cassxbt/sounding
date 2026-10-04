import { FIXTURES, liveCapture, recordedCapture } from "./data";
import type { BookCapture } from "@/engine/types";

export class HttpError extends Error { constructor(message: string, public status: number) { super(message); } }

/** Numbers a trader can send are checked here, once, for every route: nothing is broadened or defaulted silently. */
export function parseTerms(b: { ceilingBps?: unknown; userFeeBps?: unknown }): { ceilingBps: number; userFeeBps?: number } {
  // An omitted ceiling is the desk's stated default; a stated 0 stays 0.
  const ceilingBps = b.ceilingBps === undefined || b.ceilingBps === null || b.ceilingBps === "" ? 50 : Number(b.ceilingBps);
  if (!Number.isFinite(ceilingBps) || ceilingBps < 0 || ceilingBps > 10_000) throw new HttpError("ceilingBps must be a number from 0 to 10000", 400);
  if (b.userFeeBps === undefined || b.userFeeBps === null || b.userFeeBps === "") return { ceilingBps };
  const userFeeBps = Number(b.userFeeBps);
  if (!Number.isFinite(userFeeBps) || userFeeBps < 0 || userFeeBps > 1_000) throw new HttpError("userFeeBps must be a number from 0 to 1000", 400);
  return { ceilingBps, userFeeBps };
}

export function parseAmount(a: unknown): string {
  const s = String(a ?? "").trim().replace(/,(?=\d{3}\b)/g, "");
  if (!/^\d+(\.\d+)?$/.test(s) || !(Number(s) > 0)) throw new HttpError("amount must be a positive number", 400);
  return s;
}

/** The book for an order: a recorded capture (the named one only if it is for this symbol) or a live one. */
export async function bookFor(mode: "recorded" | "live", symbol: string, fixture?: string): Promise<{ capture: BookCapture; historical: boolean; fixtureFile?: string }> {
  if (mode === "live") {
    try { return { capture: await liveCapture(symbol), historical: false }; }
    catch (e) { throw new HttpError(`live book unavailable: ${(e as Error).message}`, 502); }
  }
  const key = fixture && recordedCapture(fixture)?.symbol === symbol ? fixture : symbol;
  const capture = recordedCapture(key);
  if (!capture || capture.symbol !== symbol) throw new HttpError(`no recorded book for ${symbol}; switch to live to sound it`, 404);
  return { capture, historical: true, fixtureFile: FIXTURES[key] };
}

export const errorJson = (e: unknown) => (e instanceof HttpError ? { body: { error: e.message }, status: e.status } : null);
