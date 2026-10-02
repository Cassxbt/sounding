import { NextResponse } from "next/server";
import { sound } from "@/engine";
import type { Intent } from "@/engine/types";
import { liveCapture, recordedCapture, universe } from "@/lib/data";
import { evidenceFor } from "@/analyst/evidence";
import { EMPTY_CONSTRAINTS, runAnalyst, type AnalystTurn } from "@/analyst";
import { extractConstraints } from "@/analyst/extract";
import type { AnalystOutput, Constraints } from "@/analyst/schema";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Body {
  symbol: string; side: "buy" | "sell"; amount: string; ceilingBps: number; userFeeBps?: number; mode: "recorded" | "live";
  turns: AnalystTurn[]; constraints?: Constraints; previous?: AnalystOutput; analyst?: "model" | "template";
}

export async function POST(req: Request) {
  const b = (await req.json()) as Body;
  const mode = b.mode === "live" ? "live" : "recorded";
  // Deterministic extraction runs for both arms: size changes must reach the engine before any analysis.
  const lastUser = [...(b.turns ?? [])].reverse().find((t) => t.role === "user")?.text ?? "";
  const extracted = extractConstraints(lastUser, { ...EMPTY_CONSTRAINTS, ...(b.constraints ?? {}) });
  let amount = b.amount;
  if (b.side === "sell" && extracted.sizeShares) amount = extracted.sizeShares;
  if (b.side === "buy" && extracted.sizeQuote) amount = extracted.sizeQuote;
  const intent: Intent = b.side === "buy" ? { side: "buy", quoteBudget: amount } : { side: "sell", baseQty: amount };
  let capture, historical: boolean;
  if (mode === "recorded") { capture = recordedCapture(b.symbol); historical = true; if (!capture) return NextResponse.json({ error: "no fixture" }, { status: 404 }); }
  else { try { capture = await liveCapture(b.symbol); historical = false; } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 502 }); } }
  const u = await universe(mode);
  // The template arm uses the extracted constraints; the model arm receives the prior constraints and extracts on its own.
  // Both arms start from the deterministic extraction; the model may refine it, the template uses it as-is.
  const constraints: Constraints = extracted.constraints;
  const userFee = extracted.constraints.takerFeeBps ?? b.userFeeBps ?? constraints.takerFeeBps ?? undefined;
  const result = sound({ capture, intent, ceilingBps: Number(b.ceilingBps) || 50, now: historical ? new Date(Number(capture.exchange_ts)) : new Date(), historical, stockInfo: u.stockInfo, states: u.states, calendar: u.calendar, instruments: u.instruments, userFeeBps: userFee === null ? undefined : userFee });
  if (!result.ok) return NextResponse.json({ result, analyst: null, note: `engine refused: ${result.gate}` });
  const code = u.stockInfo.find((s) => s.symbol === b.symbol)?.code ?? b.symbol.replace(/^R|USDT$/g, "");
  const evidence = await evidenceFor(b.symbol, code, mode);
  const analyst = await runAnalyst({ result, evidence, turns: b.turns ?? [], constraints, previous: b.previous, mode: b.analyst });
  return NextResponse.json({ result, evidence, analyst, amount });
}
