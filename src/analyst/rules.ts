import type { SoundingResult } from "@/engine/types";
import { costFigures } from "./normalize";
import { decidingRow } from "@/engine/decision";
import type { AnalystOutput, Constraints, EvidencePack } from "./schema";

/**
 * Structural rules the analyst cannot override. They run on both the model output and the template.
 * Each violation names the rule; a violating model answer is replaced by the template and flagged.
 */
export interface RuleViolation { rule: string; detail: string }


/** Without a deadline, an event counts only if it falls within this many days of the decision. */
export const EVIDENCE_HORIZON_DAYS = 14;

/** The NY date a decision is made on: the book's own clock. */
export const asOfNy = (res: SoundingResult) => new Date(Number(res.receipt.exchange_ts)).toLocaleDateString("en-CA", { timeZone: "America/New_York" });

export function relevantEvidenceIds(pack: EvidencePack, c: Constraints, asOf: string): { relevant: string[]; timeUnknownOnDeadline: string[] } {
  const relevant: string[] = []; const timeUnknownOnDeadline: string[] = [];
  const horizon = new Date(`${asOf}T12:00:00Z`); horizon.setUTCDate(horizon.getUTCDate() + EVIDENCE_HORIZON_DAYS);
  for (const r of pack.records) {
    if (!r.effective_date_ny) continue;
    if (r.issuer !== pack.issuer && r.issuer !== pack.code) continue;
    // An event before the decision date is history, not a reason to act now.
    if (r.effective_date_ny < asOf) continue;
    if (!c.hardDeadlineNy && r.effective_date_ny > horizon.toISOString().slice(0, 10)) continue;
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

/**
 * Tighten-only (a gate may reject or shrink, never enlarge). The checked intake is the floor:
 * the analyst may make a stated constraint stricter, never drop or relax it. Its constraints carry into the next
 * turn, so this is also what stops a limit from being loosened between turns.
 */
export function loosened(stated: Constraints, proposed: Constraints): RuleViolation[] {
  const v: RuleViolation[] = [];
  // A fee is a fact, not a limit: it must equal what the trader stated, including "not stated".
  if (proposed.takerFeeBps !== stated.takerFeeBps)
    v.push({ rule: stated.takerFeeBps === null ? "invented_constraint" : "loosened_constraint", detail: `taker fee ${stated.takerFeeBps ?? "not stated"} became ${proposed.takerFeeBps ?? "none"}` });
  if (stated.mustBeFlat && !proposed.mustBeFlat)
    v.push({ rule: "loosened_constraint", detail: "a stated must-be-flat requirement was dropped" });
  if (stated.hardDeadlineNy && (!proposed.hardDeadlineNy || proposed.hardDeadlineNy > stated.hardDeadlineNy))
    v.push({ rule: "loosened_constraint", detail: `stated deadline ${stated.hardDeadlineNy} became ${proposed.hardDeadlineNy ?? "none"}` });
  if (stated.exclusiveExposure && !proposed.exclusiveExposure)
    v.push({ rule: "loosened_constraint", detail: "exclusive exposure was dropped" });
  if (!stated.proxyConsent && proposed.proxyConsent)
    v.push({ rule: "loosened_constraint", detail: "proxy consent was added without the trader giving it" });
  return v;
}

export function validate(out: AnalystOutput, res: SoundingResult, pack: EvidencePack, stated?: Constraints, lang?: "en" | "zh"): RuleViolation[] {
  const v: RuleViolation[] = stated ? loosened(stated, out.constraints) : [];
  const kinds = new Set((res.alternatives ?? []).map((a) => a.kind));
  const c = out.constraints;

  if (out.recommendation && !kinds.has(out.recommendation)) v.push({ rule: "unpriced_alternative", detail: `${out.recommendation} was not priced by the engine` });
  for (const a of [...out.admissible, ...out.excluded]) if (!kinds.has(a.kind)) v.push({ rule: "unpriced_alternative", detail: `${a.kind} not in engine output` });

  const admissible = new Set(out.admissible.map((a) => a.kind));
  // Admissibility is the engine's, not the model's: a cross may be admitted or recommended only when the engine
  // prices the full order within the ceiling at the deciding fee (the stated fee, else the worst scenario).
  const deciding = decidingRow(res);
  const crossWithin = res.ok && res.leg?.status === "OK" && deciding?.verdict === "WITHIN_CEILING_ON_THIS_SNAPSHOT";
  if (!crossWithin && (admissible.has("immediate_cross") || out.recommendation === "immediate_cross"))
    v.push({ rule: "route_not_admissible", detail: `crossing now is ${deciding?.allInBps ?? "unpriced"} bps at ${deciding?.feeBps ?? "?"} bps fee against a ${res.ceilingBps} bps ceiling` });
  if (out.recommendation && !admissible.has(out.recommendation)) v.push({ rule: "recommendation_not_admissible", detail: `${out.recommendation} is recommended but not listed as admissible` });
  const excludedKinds = new Set(out.excluded.map((e) => e.kind));
  for (const k of admissible) if (excludedKinds.has(k)) v.push({ rule: "contradictory_classification", detail: `${k} is both admissible and excluded` });
  if (c.mustBeFlat && c.hardDeadlineNy) {
    if (admissible.has("resting_limit") || out.recommendation === "resting_limit") v.push({ rule: "hard_constraint", detail: "a resting limit (no_fill_possible) cannot satisfy a must-be-flat deadline" });
    // Unknown next session is treated as none before the deadline, the same as the template.
    const sw = res.nextSessionNy ?? "9999-12-31";
    if (c.hardDeadlineNy <= sw && (admissible.has("requote_at_switch") || out.recommendation === "requote_at_switch"))
      v.push({ rule: "hard_constraint", detail: `re-quote at the next session (${res.nextSessionNy ?? "unknown"}) is not before the deadline ${c.hardDeadlineNy}` });
    if (admissible.has("largest_within_ceiling"))
      v.push({ rule: "hard_constraint", detail: "a partial leaves an unpriced remainder; it does not exit the full position" });
  }
  if (out.recommendation === "largest_within_ceiling" && c.mustBeFlat && c.hardDeadlineNy) v.push({ rule: "hard_constraint", detail: "a partial size does not make the trader flat" });
  if (out.recommendation === "requote_at_switch" && c.mustBeFlat && c.hardDeadlineNy) v.push({ rule: "hard_constraint", detail: "re-quoting later is a chance to exit, not an exit; it cannot be the recommendation under a hard deadline" });
  else if (out.recommendation === "requote_at_switch") v.push({ rule: "unpriced_alternative", detail: "the next session routes the order to the US market, which the engine does not price; waiting can be listed, never recommended" });
  // only reasons for ADMITTING a plan step can overclaim; exclusion reasons explain why it falls short
  // Under a hard exit no route is an achieved exit, crossing included: a fill is never promised.
  const claims = [...out.admissible.map((a) => a.reason), out.explanation].join(". ");
  const achieved = /\bsatisf(?:y|ies|ying)\b|makes? you flat|gets? you (?:flat|out)|meets? (?:the|your) (?:hard )?(?:deadline|exit)|preserv\w* (?:the )?must.?be.?flat|满足.{0,8}(?:清仓|硬性|退出|截止|要求|约束)|完成清仓|确保清仓|保证清仓/i;
  // "No priced route satisfies the hard exit" is the honest answer, not a claim: a negation just before the phrase clears it.
  const negated = /\b(?:no|not|never|nothing|none|cannot|can't|doesn't|does not|won't|isn't)\b[^.;。！？]{0,40}$|(?:不|无法|没有|未|不能)[^。；]{0,12}$/i;
  const claimed = [...claims.matchAll(new RegExp(achieved.source, "gi"))].some((m) => !negated.test(claims.slice(0, m.index)));
  if (c.mustBeFlat && c.hardDeadlineNy && claimed)
    v.push({ rule: "overclaim_plan_step", detail: "a route was described as achieving the hard exit; crossing is a chance to exit, not a fill" });

  // evidence typing: only issuer-matched, dated records may be marked relevant
  const { relevant, timeUnknownOnDeadline } = relevantEvidenceIds(pack, c, asOfNy(res));
  const known = new Set(pack.records.map((r) => r.id));
  for (const e of out.evidence) {
    if (!known.has(e.recordId)) v.push({ rule: "unknown_evidence", detail: e.recordId });
    else if (e.relevant && !relevant.includes(e.recordId)) v.push({ rule: "irrelevant_evidence_used", detail: e.recordId });
  }
  // unknown event time on the deadline day blocks temporal ordering -> a clarification is required
  if (timeUnknownOnDeadline.length && !out.clarification) v.push({ rule: "unknown_event_time", detail: `event ${timeUnknownOnDeadline[0]} has no time; ordering within ${c.hardDeadlineNy} is unknown` });

  // fee sensitivity: if the verdict flips across fee scenarios and the fee is unknown, the analyst must ask for it
  if (res.feeSensitive && c.takerFeeBps === null && !out.clarification) v.push({ rule: "fee_sensitive_needs_fee", detail: "verdict depends on the fee scenario; ask for the taker rate" });

  // Never invent numbers: every cost figure in every field shown, in any unit, must be one the engine produced.
  // A negative cost is never an engine figure, so the sign is read with the number.
  const engineBps: number[] = [res.ceilingBps];
  for (const f of res.fees ?? []) { if (f.allInBps) engineBps.push(Number(f.allInBps)); engineBps.push(f.feeBps); }
  for (const a of res.alternatives ?? []) for (const [fee, b] of Object.entries(a.allInBpsByFee ?? {})) engineBps.push(Number(fee), Number(b));
  if (res.worstCase) engineBps.push(res.worstCase.feeBps, Number(res.worstCase.allInBps));
  if (out.constraints.takerFeeBps !== null) engineBps.push(out.constraints.takerFeeBps);
  if (res.leg?.bpsPreFee) engineBps.push(Number(res.leg.bpsPreFee));
  const shown = [out.explanation, out.bindingConstraint, out.clarification ?? "", out.changedBecause ?? "", ...out.admissible.map((a) => a.reason), ...out.excluded.map((a) => a.reason), ...out.evidence.map((e) => e.reason)].join(" \n ");
  // A figure may be an engine figure rounded to the precision it is written in ("0.37%", "36.9 bps"), never another one.
  const round = (x: number, dp: number) => Math.round(x * 10 ** dp) / 10 ** dp;
  for (const m of shown.matchAll(/([-−]\s*)?((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)\s*(bps?\b|basis\s+points?|个?基点|%|percent\b|per\s+cent\b)/gi)) {
    const pct = /%|cent/i.test(m[3]), raw = m[2].replace(/,/g, "");
    const bps = Number(raw) * (pct ? 100 : 1), dp = Math.max(0, (raw.split(".")[1]?.length ?? 0) - (pct ? 2 : 0));
    if (m[1] || !engineBps.some((e) => round(e, dp) === round(bps, dp))) v.push({ rule: "invented_number", detail: `${m[0].trim()} is not an engine figure` });
  }
  // Figures written in Chinese words (百分之零点三七, 千分之四, 万8) are read by the same reader intake uses.
  for (const f of costFigures(shown).filter((g) => /[百千万]/.test(g.raw))) {
    const dp = String(f.bps).split(".")[1]?.length ?? 0;
    if (!engineBps.some((e) => round(e, dp) === round(f.bps, dp))) v.push({ rule: "invented_number", detail: `${f.raw} is not an engine figure` });
  }
  // every priced alternative must be classified; a judge needs each one addressed
  const classified = new Set([...out.admissible, ...out.excluded].map((a) => a.kind));
  for (const k of kinds) if (!classified.has(k)) v.push({ rule: "unclassified_alternative", detail: `${k} neither admissible nor excluded` });

  // no promises: fill certainty, safety, guarantees, probabilities, price targets, catalysts
  const texts = [out.explanation, out.bindingConstraint, out.clarification ?? "", out.changedBecause ?? "", ...out.admissible.map((a) => a.reason), ...out.excluded.map((a) => a.reason), ...out.evidence.map((e) => e.reason)].join(" \n ");
  const banned = /\b(guarantee[sd]?|certain(?:ty|ly)?|will (?:be )?fill|fill certainty|safe(?:ly)?|risk[- ]free|price target|catalyst|probabilit(?:y|ies)|\d+\s*%\s*(?:chance|likely))\b/i;
  // The reply follows the trader's language, so the same promises are checked in Chinese.
  const bannedZh = /保证|一定(?:会)?成交|肯定(?:会)?成交|确定(?:会)?成交|无风险|零风险|稳赚|安全的|目标价|催化剂|成交概率|\d+\s*%\s*(?:的)?(?:概率|可能)/;
  const hit = texts.match(banned) ?? texts.match(bannedZh);
  if (hit) v.push({ rule: "promise_language", detail: `"${hit[0]}"` });

  if (lang) {
    const cjk = (out.explanation.match(/[\u4e00-\u9fff]/g) ?? []).length;
    const latin = (out.explanation.match(/[A-Za-z]/g) ?? []).length;
    if (lang === "zh" ? cjk === 0 : cjk > latin / 4) v.push({ rule: "reply_language", detail: `reply is not in ${lang === "zh" ? "Chinese" : "English"}` });
  }
  const wc = out.explanation.trim().split(/\s+/).length;
  if (wc > 120) v.push({ rule: "length", detail: `${wc} words > 120` });
  return v;
}
