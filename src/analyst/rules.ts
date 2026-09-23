import type { SoundingResult } from "@/engine/types";
import type { AnalystOutput, Constraints, EvidencePack } from "./schema";

/**
 * Structural rules the analyst cannot override. They run on both the model output and the template.
 * Each violation names the rule; a violating model answer is replaced by the template and flagged.
 */
export interface RuleViolation { rule: string; detail: string }

const NEXT_SWITCH_NY = (res: SoundingResult): string | null => {
  // Weekend/holiday MM session: the next switch is the next trading-day 04:00 NY. We only know the date coarsely here;
  // the analyst treats "requote_at_switch" as admissible only if the hard deadline is strictly after that date.
  if (res.session !== "weekend_mm" && res.session !== "holiday_mm") return null;
  const ts = Number(res.receipt.exchange_ts);
  const d = new Date(ts);
  // next weekday after this instant, in NY
  const ny = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", year: "numeric", month: "2-digit", day: "2-digit" });
  for (let i = 0; i <= 4; i++) {
    const cand = new Date(ts + i * 86_400_000);
    const parts = Object.fromEntries(ny.formatToParts(cand).map((p) => [p.type, p.value]));
    if (!["Sat", "Sun"].includes(parts.weekday) && i > 0) return `${parts.year}-${parts.month}-${parts.day}`;
  }
  return null;
};

export function relevantEvidenceIds(pack: EvidencePack, c: Constraints): { relevant: string[]; timeUnknownOnDeadline: string[] } {
  const relevant: string[] = []; const timeUnknownOnDeadline: string[] = [];
  for (const r of pack.records) {
    if (!r.effective_date_ny) continue;
    if (r.issuer !== pack.issuer && r.issuer !== pack.code) continue;
    // an event is relevant only if it falls on/after today's session and on/before the horizon (deadline) when one exists
    if (c.hardDeadlineNy && r.effective_date_ny > c.hardDeadlineNy) {
      // event after the deadline: relevant as the reason for the deadline when it is the next day; ordering is unambiguous
      const dl = new Date(c.hardDeadlineNy + "T12:00:00Z").getTime(); const ev = new Date(r.effective_date_ny + "T12:00:00Z").getTime();
      if (ev - dl <= 86_400_000) relevant.push(r.id);
      continue;
    }
    relevant.push(r.id);
    if (!r.time_known && c.hardDeadlineNy === r.effective_date_ny) timeUnknownOnDeadline.push(r.id);
  }
  return { relevant, timeUnknownOnDeadline };
}

export function validate(out: AnalystOutput, res: SoundingResult, pack: EvidencePack): RuleViolation[] {
  const v: RuleViolation[] = [];
  const kinds = new Set((res.alternatives ?? []).map((a) => a.kind));
  const c = out.constraints;

  if (out.recommendation && !kinds.has(out.recommendation)) v.push({ rule: "unpriced_alternative", detail: `${out.recommendation} was not priced by the engine` });
  for (const a of [...out.admissible, ...out.excluded]) if (!kinds.has(a.kind)) v.push({ rule: "unpriced_alternative", detail: `${a.kind} not in engine output` });

  const admissible = new Set(out.admissible.map((a) => a.kind));
  if (c.mustBeFlat && c.hardDeadlineNy) {
    if (admissible.has("resting_limit") || out.recommendation === "resting_limit") v.push({ rule: "hard_constraint", detail: "a resting limit (no_fill_possible) cannot satisfy a must-be-flat deadline" });
    const sw = NEXT_SWITCH_NY(res);
    if (sw && c.hardDeadlineNy <= sw && (admissible.has("requote_at_switch") || out.recommendation === "requote_at_switch"))
      v.push({ rule: "hard_constraint", detail: `re-quote at switch (${sw}) is not before the deadline ${c.hardDeadlineNy}` });
  }
  if (out.recommendation === "largest_within_ceiling" && c.mustBeFlat && c.hardDeadlineNy) v.push({ rule: "hard_constraint", detail: "a partial size does not make the trader flat" });
  if (out.recommendation === "requote_at_switch" && c.mustBeFlat && c.hardDeadlineNy) v.push({ rule: "hard_constraint", detail: "re-quoting later is a chance to exit, not an exit; it cannot be the recommendation under a hard deadline" });
  // only reasons for ADMITTING a plan step can overclaim; exclusion reasons explain why it falls short
  const requoteClaims = out.admissible.filter((a) => a.kind === "requote_at_switch" || a.kind === "largest_within_ceiling").map((a) => a.reason).join(" ");
  if (c.mustBeFlat && c.hardDeadlineNy && /\bsatisf(?:y|ies|ying)\b|makes? you flat|meets? (?:the|your) (?:hard )?(?:deadline|exit)|preserv\w* (?:the )?must.?be.?flat/i.test(requoteClaims))
    v.push({ rule: "overclaim_plan_step", detail: "a re-quote or partial size was described as satisfying the hard exit" });

  // evidence typing: only issuer-matched, dated records may be marked relevant
  const { relevant, timeUnknownOnDeadline } = relevantEvidenceIds(pack, c);
  const known = new Set(pack.records.map((r) => r.id));
  for (const e of out.evidence) {
    if (!known.has(e.recordId)) v.push({ rule: "unknown_evidence", detail: e.recordId });
    else if (e.relevant && !relevant.includes(e.recordId)) v.push({ rule: "irrelevant_evidence_used", detail: e.recordId });
  }
  // unknown event time on the deadline day blocks temporal ordering -> a clarification is required
  if (timeUnknownOnDeadline.length && !out.clarification) v.push({ rule: "unknown_event_time", detail: `event ${timeUnknownOnDeadline[0]} has no time; ordering within ${c.hardDeadlineNy} is unknown` });

  // fee sensitivity: if the verdict flips across fee scenarios and the fee is unknown, the analyst must ask for it
  if (res.feeSensitive && c.takerFeeBps === null && !out.clarification) v.push({ rule: "fee_sensitive_needs_fee", detail: "verdict depends on the fee scenario; ask for the taker rate" });

  // never invent numbers: every bps figure in the explanation must appear in the engine output
  const engineNums = new Set<string>();
  for (const f of res.fees ?? []) { if (f.allInBps) engineNums.add(f.allInBps); engineNums.add(String(f.feeBps)); }
  if (out.constraints.takerFeeBps !== null) engineNums.add(String(out.constraints.takerFeeBps));
  if (res.leg?.bpsPreFee) engineNums.add(res.leg.bpsPreFee);
  engineNums.add(String(res.ceilingBps));
  for (const m of out.explanation.matchAll(/(\d+(?:\.\d+)?)\s*bps/g)) {
    const n = m[1];
    if (![...engineNums].some((e) => Number(e) === Number(n))) v.push({ rule: "invented_number", detail: `${n} bps is not an engine figure` });
  }
  // every priced alternative must be classified; a judge needs each one addressed
  const classified = new Set([...out.admissible, ...out.excluded].map((a) => a.kind));
  for (const k of kinds) if (!classified.has(k)) v.push({ rule: "unclassified_alternative", detail: `${k} neither admissible nor excluded` });

  // no promises: fill certainty, safety, guarantees, probabilities, price targets, catalysts
  const texts = [out.explanation, out.bindingConstraint, out.clarification ?? "", ...out.admissible.map((a) => a.reason), ...out.excluded.map((a) => a.reason), ...out.evidence.map((e) => e.reason)].join(" \n ");
  const banned = /\b(guarantee[sd]?|certain(?:ty|ly)?|will (?:be )?fill|fill certainty|safe(?:ly)?|risk[- ]free|price target|catalyst|probabilit(?:y|ies)|\d+\s*%\s*(?:chance|likely))\b/i;
  const hit = texts.match(banned);
  if (hit) v.push({ rule: "promise_language", detail: `"${hit[0]}"` });

  const wc = out.explanation.trim().split(/\s+/).length;
  if (wc > 120) v.push({ rule: "length", detail: `${wc} words > 120` });
  return v;
}
