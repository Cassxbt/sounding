import type { SoundingResult } from "@/engine/types";
import type { AnalystOutput, Constraints, EvidencePack } from "./schema";
import { relevantEvidenceIds } from "./rules";

/**
 * Deterministic baseline. Same schema as the model, no LLM. It is the fallback when the model is
 * unavailable or violates a rule, and the comparison arm in the preregistered test.
 */
export function templateAnalysis(res: SoundingResult, pack: EvidencePack, c: Constraints, previous?: AnalystOutput): AnalystOutput {
  const alts = res.alternatives ?? [];
  const kinds = alts.map((a) => a.kind);
  const admissible: AnalystOutput["admissible"] = []; const excluded: AnalystOutput["excluded"] = [];
  const { relevant, timeUnknownOnDeadline } = relevantEvidenceIds(pack, c);
  const worstWithin = (res.fees ?? []).every((f) => f.verdict === "WITHIN_CEILING_ON_THIS_SNAPSHOT");
  const anyWithin = (res.fees ?? []).some((f) => f.verdict === "WITHIN_CEILING_ON_THIS_SNAPSHOT");
  const feeKnown = c.takerFeeBps !== null;
  const userFee = (res.fees ?? []).find((f) => f.source === "user");
  const crossWithin = feeKnown && userFee ? userFee.verdict === "WITHIN_CEILING_ON_THIS_SNAPSHOT" : worstWithin;

  for (const k of kinds) {
    if (k === "immediate_cross") {
      if (crossWithin) admissible.push({ kind: k, reason: feeKnown ? "within ceiling at your stated fee on this snapshot" : "within ceiling at every fee scenario on this snapshot" });
      else if (anyWithin && !feeKnown) excluded.push({ kind: k, reason: "over ceiling at the 20 bps scenario; fee unknown" });
      else excluded.push({ kind: k, reason: "over ceiling on this snapshot" });
    } else if (k === "largest_within_ceiling") {
      if (c.mustBeFlat && c.hardDeadlineNy) excluded.push({ kind: k, reason: "partial size does not make you flat" });
      else admissible.push({ kind: k, reason: "reduces size to fit the ceiling; partial exposure change" });
    } else if (k === "resting_limit") {
      if (c.mustBeFlat && c.hardDeadlineNy) excluded.push({ kind: k, reason: "no_fill_possible; cannot satisfy a must-be-flat deadline" });
      else admissible.push({ kind: k, reason: "hypothetical; only if filled; cancelled at the session switch" });
    } else if (k === "requote_at_switch") {
      if (c.mustBeFlat && c.hardDeadlineNy && c.hardDeadlineNy <= nextSwitch(res)) excluded.push({ kind: k, reason: "the next session is not before your deadline" });
      else if (c.mustBeFlat && c.hardDeadlineNy) admissible.push({ kind: k, reason: "reassess at the next session; a later chance to exit, not an exit; nothing promised about cost then" });
      else admissible.push({ kind: k, reason: "reassess at the next session; nothing promised about cost then" });
    }
  }
  let clarification: string | null = null;
  if (res.feeSensitive && !feeKnown) clarification = "What is your actual taker fee in bps? The verdict flips between the 10 and 20 bps scenarios.";
  else if (timeUnknownOnDeadline.length) clarification = "The event on your deadline day has no published time. Must you be flat before the session opens that day, or by its close?";

  const hardExit = c.mustBeFlat && !!c.hardDeadlineNy;
  // Under a hard exit only a full-size route that is within ceiling now can be recommended; re-quote is a plan step.
  const rec = admissible.find((a) => a.kind === "immediate_cross")?.kind
    ?? (hardExit ? null : admissible.find((a) => a.kind === "requote_at_switch")?.kind ?? admissible[0]?.kind ?? null);
  const noRoute = hardExit && !rec && !clarification;
  const binding = res.feeSensitive && !feeKnown ? "fee scenario (verdict flips at 20 bps)"
    : noRoute ? `no priced route exits the full position within ${res.ceilingBps} bps on this snapshot; reassess at the next session`
    : hardExit ? `hard deadline ${c.hardDeadlineNy} (must be flat)` : `ceiling ${res.ceilingBps} bps on this snapshot`;
  const evidence = pack.records.map((r) => ({ recordId: r.id, relevant: relevant.includes(r.id), reason: relevant.includes(r.id) ? `${r.kind} dated ${r.effective_date_ny}${r.time_known ? "" : ", time not published"}` : "not dated or not within horizon" }));
  const pre = res.leg?.bpsPreFee ?? "—";
  const fees = (res.fees ?? []).map((f) => `${f.allInBps ?? "—"} at ${f.feeBps}`).join(", ");
  const explanation = `Engine: ${pre} bps pre-fee; all-in ${fees} bps vs ceiling ${res.ceilingBps} bps. ${clarification ? "Clarification needed before a route is chosen. " : ""}Admissible: ${admissible.map((a) => a.kind).join(", ") || "none"}. Excluded: ${excluded.map((e) => `${e.kind} (${e.reason})`).join("; ") || "none"}. Evidence: ${relevant.join(", ") || "none relevant"}.`;
  const changedBecause = previous ? (previous.recommendation === rec ? "recommendation unchanged; inputs changed the numbers only" : `recommendation changed from ${previous.recommendation ?? "none"} to ${rec ?? "none"} because the constraint set or the cost class changed`) : null;
  return { constraints: c, clarification, admissible, excluded, recommendation: clarification ? null : rec, bindingConstraint: binding, evidence, changedBecause, explanation };
}

function nextSwitch(res: SoundingResult): string {
  const ts = Number(res.receipt.exchange_ts);
  const ny = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", year: "numeric", month: "2-digit", day: "2-digit" });
  for (let i = 1; i <= 4; i++) {
    const parts = Object.fromEntries(ny.formatToParts(new Date(ts + i * 86_400_000)).map((p) => [p.type, p.value]));
    if (!["Sat", "Sun"].includes(parts.weekday)) return `${parts.year}-${parts.month}-${parts.day}`;
  }
  return "9999-12-31";
}
