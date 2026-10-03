import type { SoundingResult } from "@/engine/types";
import type { AnalystOutput, Constraints, EvidencePack } from "./schema";
import { templateAnalysis } from "./template";
import { validate, type RuleViolation } from "./rules";
import { QWEN, qwenAnalyze, qwenAvailable } from "./qwen";

export const EMPTY_CONSTRAINTS: Constraints = { thesis: null, hardDeadlineNy: null, mustBeFlat: false, exclusiveExposure: false, proxyConsent: false, takerFeeBps: null };

export interface AnalystTurn { role: "user" | "assistant"; text: string }
export interface AnalystResponse {
  output: AnalystOutput;
  producedBy: "model" | "template";
  provider?: "qwen";
  model?: string;
  violations: RuleViolation[];
  modelOutputRejected?: AnalystOutput;
}

export const SYSTEM = `You are the analyst inside Sounding, a pre-trade research desk for Bitget rTokens (tokenized US stocks).
A deterministic engine has already computed the cost of the trader's order from the live/recorded order book. You never change those numbers.
Your job: given the trader's stated constraints and dated evidence, decide which of the engine's PRICED alternatives serve the trader's thesis, and explain the binding constraint.

Rules you must follow:
- Only the alternatives the engine priced may be admissible, excluded, or recommended.
- A hard "must be flat by <date>" constraint excludes any alternative that may not fill (resting_limit) and any partial size; a disclaimer does not satisfy a hard constraint. If nothing satisfies every hard constraint, recommendation is null and you say so.
- Evidence: a record may be marked relevant only if its issuer matches this instrument and its date lies within the decision horizon (or is the event the deadline is set against). Real but irrelevant events must be marked relevant=false.
- If a relevant event has no published time and it falls on the deadline day, you cannot order it against the session; ask the one question that resolves timing instead of recommending.
- If the engine flags FEE_SENSITIVE and the trader has not stated their taker fee, ask for the fee before recommending.
- Never state a fill probability, a price target, a catalyst, or "safe". Never invent numbers: every bps figure you write must be one the engine produced.
- requote_at_switch is only a chance to reassess later: it never satisfies a hard exit and can never be the recommendation under one. largest_within_ceiling is a partial exit. If no full-size route is within the ceiling now, say no priced route satisfies the hard exit on this snapshot.
- Classify EVERY alternative the engine priced as either admissible or excluded; none may be left out, even while you ask a clarification.
- Never use the words guarantee, certain, certainty, safe, risk-free, or say an order "will fill"; the future book is unknown. Say "may fill" / "conditional on this snapshot".
- Explanation under 120 words. One clarification at most.
- On follow-up turns, keep every earlier constraint unless the trader changes it, and say why the recommendation changed or stayed.`;

export function buildUserPrompt(result: SoundingResult, evidence: EvidencePack, constraints: Constraints, turns: AnalystTurn[], previous?: AnalystOutput): string {
  const engineView = {
    symbol: result.symbol, session: result.session, sessionDetail: result.sessionDetail, weekendTradable: result.weekendTradable,
    intent: result.intent, ceilingBps: result.ceilingBps, referenceMid: result.referenceMid, leg: result.leg, fees: result.fees, feeSensitive: result.feeSensitive,
    alternatives: result.alternatives, exchange_ts: result.receipt.exchange_ts, historical: result.freshness.historical,
  };
  return `ENGINE OUTPUT (authoritative, do not alter):\n${JSON.stringify(engineView, null, 1)}\n\nEVIDENCE PACK (${evidence.source_kind}):\n${JSON.stringify(evidence.records, null, 1)}\n\nCONSTRAINTS SO FAR:\n${JSON.stringify(constraints)}\n\n${previous ? `PREVIOUS ANALYSIS:\n${JSON.stringify(previous)}\n\n` : ""}CONVERSATION:\n${turns.map((t) => `${t.role.toUpperCase()}: ${t.text}`).join("\n")}\n\nUpdate the constraints from the conversation, then produce the analysis.`;
}

export async function runAnalyst(args: { result: SoundingResult; evidence: EvidencePack; turns: AnalystTurn[]; constraints: Constraints; previous?: AnalystOutput; mode?: "model" | "template" }): Promise<AnalystResponse> {
  const { result, evidence, turns, constraints, previous } = args;
  const template = templateAnalysis(result, evidence, constraints, previous);
  if (args.mode === "template" || !qwenAvailable()) return { output: template, producedBy: "template", violations: [] };
  const model = QWEN.model;
  try {
    const { parsed } = await qwenAnalyze(SYSTEM, buildUserPrompt(result, evidence, constraints, turns, previous));
    if (!parsed) return { output: template, producedBy: "template", provider: "qwen", model, violations: [{ rule: "parse_failed", detail: "model output did not parse" }] };
    const violations = validate(parsed, result, evidence, constraints);
    if (violations.length) {
      // The fallback answers from the checked intake, never from the rejected model's constraints.
      const fallback = templateAnalysis(result, evidence, constraints, previous);
      return { output: fallback, producedBy: "template", provider: "qwen", model, violations, modelOutputRejected: parsed };
    }
    return { output: parsed, producedBy: "model", provider: "qwen", model, violations: [] };
  } catch (e) {
    return { output: template, producedBy: "template", provider: "qwen", model, violations: [{ rule: "model_unavailable", detail: (e as Error).message }] };
  }
}
