import { NextResponse } from "next/server";
import { sound } from "@/engine";
import type { Intent } from "@/engine/types";
import { liveCapture, recordedCapture, universe } from "@/lib/data";
import { evidenceFor } from "@/analyst/evidence";
import { EMPTY_CONSTRAINTS, runAnalyst, type AnalystTurn } from "@/analyst";
import { intake } from "@/analyst/intake";
import { templateAnalysis } from "@/analyst/template";
import { nyClock } from "@/engine/session";
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
  let capture, historical: boolean;
  if (mode === "recorded") { capture = recordedCapture(b.symbol); historical = true; if (!capture) return NextResponse.json({ error: "no fixture" }, { status: 404 }); }
  else { try { capture = await liveCapture(b.symbol); historical = false; } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 502 }); } }
  const u = await universe(mode);
  const now = historical ? new Date(Number(capture.exchange_ts)) : new Date();
  // Checked intake: Qwen reads the words, code verifies the cited span and re-reads it; the regex arm is the baseline.
  const lastUser = [...(b.turns ?? [])].reverse().find((t) => t.role === "user")?.text ?? "";
  const read = await intake(lastUser, { ...EMPTY_CONSTRAINTS, ...(b.constraints ?? {}) }, nyClock(now).date, b.analyst === "template" ? "template" : "model");
  let amount = b.amount;
  if (b.side === "sell" && read.sizeShares) amount = read.sizeShares;
  if (b.side === "buy" && read.sizeQuoteUsdt) amount = read.sizeQuoteUsdt;
  const intent: Intent = b.side === "buy" ? { side: "buy", quoteBudget: amount } : { side: "sell", baseQty: amount };
  const constraints: Constraints = read.constraints;
  const ceilingBps = read.ceilingBps ?? (Number(b.ceilingBps) || 50);
  const userFee = constraints.takerFeeBps ?? b.userFeeBps ?? undefined;
  const result = sound({ capture, intent, ceilingBps, now, historical, stockInfo: u.stockInfo, states: u.states, calendar: u.calendar, instruments: u.instruments, userFeeBps: userFee === null ? undefined : userFee });
  if (!result.ok) return NextResponse.json({ result, intake: read, analyst: null, amount, note: `engine refused: ${result.gate}` });
  const code = u.stockInfo.find((s) => s.symbol === b.symbol)?.code ?? b.symbol.replace(/^R|USDT$/g, "");
  const evidence = await evidenceFor(b.symbol, code, mode);
  // A conflict between what Qwen read and what code reads is asked back, never resolved by guessing.
  const analyst = read.clarification
    ? { output: { ...templateAnalysis(result, evidence, constraints, b.previous), clarification: read.clarification, recommendation: null }, producedBy: "template" as const, violations: [] }
    : await runAnalyst({ result, evidence, turns: b.turns ?? [], constraints, previous: b.previous, mode: b.analyst });
  return NextResponse.json({ result, evidence, analyst, amount, ceilingBps, intake: read });
}
