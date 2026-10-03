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
      if (c.mustBeFlat && c.hardDeadlineNy) excluded.push({ kind: k, reason: "a partial leaves an unpriced remainder; it does not exit the full position" });
      else admissible.push({ kind: k, reason: "reduces size to fit the ceiling; the remainder is unpriced" });
    } else if (k === "resting_limit") {
      if (c.mustBeFlat && c.hardDeadlineNy) excluded.push({ kind: k, reason: "may not fill at all, so it cannot get you out by your deadline" });
      else admissible.push({ kind: k, reason: "hypothetical; only if filled; cancelled at the session switch" });
    } else if (k === "requote_at_switch") {
      if (c.mustBeFlat && c.hardDeadlineNy && c.hardDeadlineNy <= (res.nextSessionNy ?? "9999-12-31")) excluded.push({ kind: k, reason: "the next session is not before your deadline" });
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
  const binding = res.feeSensitive && !feeKnown ? "your fee: the answer flips between 10 and 20 bps"
    : noRoute ? `no priced route exits the full position within ${res.ceilingBps} bps on this snapshot; reassess at the next session`
    : hardExit ? `you must be out by ${c.hardDeadlineNy}` : `your ${res.ceilingBps} bps ceiling, on this snapshot`;
  const evidence = pack.records.map((r) => ({ recordId: r.id, relevant: relevant.includes(r.id), reason: relevant.includes(r.id) ? `${r.kind} dated ${r.effective_date_ny}${r.time_known ? "" : ", time not published"}` : "not dated or not within horizon" }));
  const explanation = plainExplanation(res, c, clarification ? null : rec, excluded, clarification, hardExit, userFee);
  const changedBecause = previous ? (previous.recommendation === rec ? "recommendation unchanged; inputs changed the numbers only" : `recommendation changed from ${previous.recommendation ?? "none"} to ${rec ?? "none"} because the constraint set or the cost class changed`) : null;
  return { constraints: c, clarification, admissible, excluded, recommendation: clarification ? null : rec, bindingConstraint: binding, evidence, changedBecause, explanation };
}

const SAY: Record<string, string> = { immediate_cross: "crossing now", largest_within_ceiling: "a partial at the largest size that fits", resting_limit: "resting a limit", requote_at_switch: "waiting for the next session" };

/** What the trader reads: the answer first, then the one limit that decides it. Engine figures only. */
function plainExplanation(res: SoundingResult, c: Constraints, rec: string | null, excluded: AnalystOutput["excluded"], clarification: string | null, hardExit: boolean, userFee?: { feeBps: number; allInBps?: string }): string {
  if (clarification) return `One thing first: ${clarification}`;
  const worst = [...(res.fees ?? [])].filter((f) => f.source === "scenario").sort((a, b) => b.feeBps - a.feeBps)[0];
  const row = userFee ?? worst;
  const fee = row ? `${userFee ? "your" : "the worst-case"} ${row.feeBps} bps fee` : "the fee scenarios";
  const ruledOut = excluded.filter((e) => e.kind !== "immediate_cross").map((e) => SAY[e.kind]).join(" and ");
  const deadline = hardExit && c.hardDeadlineNy ? ` Because you must be out by ${c.hardDeadlineNy}, ${ruledOut || "nothing else"} ${ruledOut.includes(" and ") ? "are" : "is"} ruled out.` : "";
  if (rec === "immediate_cross" && row?.allInBps) return `Cross now at full size: ${row.allInBps} bps all-in at ${fee}, inside your ${res.ceilingBps} bps ceiling on this snapshot.${deadline}`;
  if (rec) return `Crossing now does not fit your ${res.ceilingBps} bps ceiling at ${fee}; the route that does is ${SAY[rec] ?? rec}.${deadline}`;
  if (hardExit) return `No priced route exits the full position inside your ${res.ceilingBps} bps ceiling at ${fee} on this snapshot. The largest size that fits is listed; the rest is unpriced until the book is read again.`;
  return `Nothing priced fits your ${res.ceilingBps} bps ceiling at ${fee} on this snapshot.`;
}
