import type { SoundingResult } from "@/engine/types";
import type { AnalystOutput, Constraints, EvidencePack } from "./schema";
import { asOfNy, relevantEvidenceIds } from "./rules";

type Lang = "en" | "zh";

/** Every sentence the template can say, in the trader's language. Engine figures are passed in, never written here. */
const T = {
  en: {
    crossUser: "within ceiling at your stated fee on this snapshot",
    crossAll: "within ceiling at every fee scenario on this snapshot",
    crossWorst: (hi: number) => `over ceiling at the ${hi} bps scenario; fee unknown`,
    crossOver: "over ceiling on this snapshot",
    partialOut: "a partial leaves an unpriced remainder; it does not exit the full position",
    partialIn: "reduces size to fit the ceiling; the remainder is unpriced",
    restOut: "may not fill at all, so it cannot get you out by your deadline",
    restIn: "hypothetical; only if filled; cancelled at the session switch",
    requoteLate: "the next session is not before your deadline",
    requoteExit: "reassess at the next session; a later chance to exit, not an exit; nothing promised about cost then",
    requote: "reassess at the next session; nothing promised about cost then",
    askFee: (lo: number, hi: number) => `What is your actual taker fee in bps? The verdict flips between the ${lo} and ${hi} bps scenarios.`,
    askTime: "The event on your deadline day has no published time. Must you be flat before the session opens that day, or by its close?",
    bindFee: (lo: number, hi: number) => `your fee: the answer flips between ${lo} and ${hi} bps`,
    bindNone: (ceil: number) => `no priced route exits the full position within ${ceil} bps on this snapshot; reassess at the next session`,
    bindExit: (d: string) => `you must be out by ${d}`,
    bindCeil: (ceil: number) => `your ${ceil} bps ceiling, on this snapshot`,
    evidence: (kind: string, date: string, timed: boolean) => `${kind} dated ${date}${timed ? "" : ", time not published"}`,
    evidenceOut: "not dated or not within horizon",
    unchanged: "recommendation unchanged; inputs changed the numbers only",
    changed: (a: string, b: string) => `recommendation changed from ${a} to ${b} because the constraint set or the cost class changed`,
    none: "none",
    say: { immediate_cross: "crossing now", largest_within_ceiling: "a partial at the largest size that fits", resting_limit: "resting a limit", requote_at_switch: "waiting for the next session" } as Record<string, string>,
    first: (q: string) => `One thing first: ${q}`,
    fee: (bps: number, user: boolean) => `${user ? "your" : "the higher scenario's"} ${bps} bps fee`,
    feeAny: "the fee scenarios",
    deadline: (d: string, out: string) => ` Because you must be out by ${d}, ${out || "nothing else"} ${out.includes(" and ") ? "are" : "is"} ruled out.`,
    and: " and ",
    cross: (allIn: string, fee: string, ceil: number, dl: string) => `Cross now at full size: ${allIn} bps all-in at ${fee}, inside your ${ceil} bps ceiling on this snapshot.${dl}`,
    other: (ceil: number, fee: string, route: string, dl: string) => `Crossing now does not fit your ${ceil} bps ceiling at ${fee}; the route that does is ${route}.${dl}`,
    noExit: (ceil: number, fee: string) => `No priced route exits the full position inside your ${ceil} bps ceiling at ${fee} on this snapshot. The largest size that fits is listed; the rest is unpriced until the book is read again.`,
    nothing: (ceil: number, fee: string) => `Nothing priced fits your ${ceil} bps ceiling at ${fee} on this snapshot.`,
  },
  zh: {
    crossUser: "按你给出的费率，在当前快照上处于上限之内",
    crossAll: "在当前快照上，每种费率情景下都处于上限之内",
    crossWorst: (hi: number) => `在 ${hi} bps 费率情景下超出上限；你的费率未知`,
    crossOver: "在当前快照上超出上限",
    partialOut: "部分成交会留下未定价的剩余部分，不能让整个仓位退出",
    partialIn: "缩小数量以符合上限；剩余部分未定价",
    restOut: "可能完全不成交，所以不能让你在截止日前退出",
    restIn: "仅为假设；只有成交才算数；会在交易时段切换时撤销",
    requoteLate: "下一个交易时段不在你的截止日之前",
    requoteExit: "在下一个交易时段重新评估；那是之后的一次退出机会，不是退出本身；届时的成本不作任何承诺",
    requote: "在下一个交易时段重新评估；届时的成本不作任何承诺",
    askFee: (lo: number, hi: number) => `你实际的 taker 费率是多少 bps？结论会在 ${lo} 和 ${hi} bps 两种情景之间翻转。`,
    askTime: "你截止日当天的事件没有公布具体时间。你必须在当天开盘前退出，还是在收盘前退出？",
    bindFee: (lo: number, hi: number) => `你的费率：结论在 ${lo} 和 ${hi} bps 之间翻转`,
    bindNone: (ceil: number) => `在当前快照上，没有任何已定价路线能在 ${ceil} bps 内让整个仓位退出；在下一个交易时段重新评估`,
    bindExit: (d: string) => `你必须在 ${d} 前退出`,
    bindCeil: (ceil: number) => `你的 ${ceil} bps 上限（基于当前快照）`,
    evidence: (kind: string, date: string, timed: boolean) => `${kind}，日期 ${date}${timed ? "" : "，未公布具体时间"}`,
    evidenceOut: "没有日期或不在时间范围内",
    unchanged: "建议未变；输入只改变了数字",
    changed: (a: string, b: string) => `建议由 ${a} 改为 ${b}，因为约束条件或成本类别发生了变化`,
    none: "无",
    say: { immediate_cross: "立即吃单", largest_within_ceiling: "按符合上限的最大数量部分成交", resting_limit: "挂限价单", requote_at_switch: "等待下一个交易时段" } as Record<string, string>,
    first: (q: string) => `先确认一件事：${q}`,
    fee: (bps: number, user: boolean) => `${user ? "你的" : "较高情景的"} ${bps} bps 费率`,
    feeAny: "各种费率情景",
    deadline: (d: string, out: string) => `因为你必须在 ${d} 前退出，${out || "其他路线"}已被排除。`,
    and: "和",
    cross: (allIn: string, fee: string, ceil: number, dl: string) => `现在以全部数量吃单：按${fee}，全部成本 ${allIn} bps，在当前快照上处于你的 ${ceil} bps 上限之内。${dl}`,
    other: (ceil: number, fee: string, route: string, dl: string) => `按${fee}，现在吃单不符合你的 ${ceil} bps 上限；符合上限的路线是${route}。${dl}`,
    noExit: (ceil: number, fee: string) => `按${fee}，在当前快照上没有任何已定价路线能在你的 ${ceil} bps 上限内让整个仓位退出。已列出符合上限的最大数量；其余部分在重新读取订单簿之前未定价。`,
    nothing: (ceil: number, fee: string) => `按${fee}，在当前快照上没有任何已定价方案符合你的 ${ceil} bps 上限。`,
  },
};

/**
 * Deterministic baseline. Same schema as the model, no LLM. It is the fallback when the model is
 * unavailable or violates a rule, and the comparison arm in the preregistered test.
 */
export function templateAnalysis(res: SoundingResult, pack: EvidencePack, c: Constraints, previous?: AnalystOutput, lang: Lang = "en"): AnalystOutput {
  const t = T[lang];
  const alts = res.alternatives ?? [];
  const kinds = alts.map((a) => a.kind);
  const admissible: AnalystOutput["admissible"] = []; const excluded: AnalystOutput["excluded"] = [];
  const { relevant, timeUnknownOnDeadline } = relevantEvidenceIds(pack, c, asOfNy(res));
  const worstWithin = (res.fees ?? []).every((f) => f.verdict === "WITHIN_CEILING_ON_THIS_SNAPSHOT");
  const anyWithin = (res.fees ?? []).some((f) => f.verdict === "WITHIN_CEILING_ON_THIS_SNAPSHOT");
  const feeKnown = c.takerFeeBps !== null;
  const userFee = (res.fees ?? []).find((f) => f.source === "user");
  const crossWithin = feeKnown && userFee ? userFee.verdict === "WITHIN_CEILING_ON_THIS_SNAPSHOT" : worstWithin;
  // The fee scenarios are the engine's; the template names them, never its own numbers.
  const scen = (res.fees ?? []).filter((f) => f.source === "scenario").map((f) => f.feeBps);
  const lo = Math.min(...scen), hi = Math.max(...scen);

  for (const k of kinds) {
    if (k === "immediate_cross") {
      if (crossWithin) admissible.push({ kind: k, reason: feeKnown ? t.crossUser : t.crossAll });
      else if (anyWithin && !feeKnown) excluded.push({ kind: k, reason: t.crossWorst(hi) });
      else excluded.push({ kind: k, reason: t.crossOver });
    } else if (k === "largest_within_ceiling") {
      if (c.mustBeFlat && c.hardDeadlineNy) excluded.push({ kind: k, reason: t.partialOut });
      else admissible.push({ kind: k, reason: t.partialIn });
    } else if (k === "resting_limit") {
      if (c.mustBeFlat && c.hardDeadlineNy) excluded.push({ kind: k, reason: t.restOut });
      else admissible.push({ kind: k, reason: t.restIn });
    } else if (k === "requote_at_switch") {
      if (c.mustBeFlat && c.hardDeadlineNy && c.hardDeadlineNy <= (res.nextSessionNy ?? "9999-12-31")) excluded.push({ kind: k, reason: t.requoteLate });
      else if (c.mustBeFlat && c.hardDeadlineNy) admissible.push({ kind: k, reason: t.requoteExit });
      else admissible.push({ kind: k, reason: t.requote });
    }
  }
  let clarification: string | null = null;
  if (res.feeSensitive && !feeKnown) clarification = t.askFee(lo, hi);
  else if (timeUnknownOnDeadline.length) clarification = t.askTime;

  const hardExit = c.mustBeFlat && !!c.hardDeadlineNy;
  // Under a hard exit only a full-size route that is within ceiling now can be recommended; re-quote is a plan step.
  const rec = admissible.find((a) => a.kind === "immediate_cross")?.kind
    ?? (hardExit ? null : admissible.find((a) => a.kind === "requote_at_switch")?.kind ?? admissible[0]?.kind ?? null);
  const noRoute = hardExit && !rec && !clarification;
  const binding = res.feeSensitive && !feeKnown ? t.bindFee(lo, hi)
    : noRoute ? t.bindNone(res.ceilingBps)
    : hardExit ? t.bindExit(c.hardDeadlineNy!) : t.bindCeil(res.ceilingBps);
  const evidence = pack.records.map((r) => ({ recordId: r.id, relevant: relevant.includes(r.id), reason: relevant.includes(r.id) ? t.evidence(r.kind, String(r.effective_date_ny), r.time_known) : t.evidenceOut }));
  const explanation = plainExplanation(t, res, c, clarification ? null : rec, excluded, clarification, hardExit, userFee);
  const changedBecause = previous ? (previous.recommendation === rec ? t.unchanged : t.changed(previous.recommendation ?? t.none, rec ?? t.none)) : null;
  return { constraints: c, clarification, admissible, excluded, recommendation: clarification ? null : rec, bindingConstraint: binding, evidence, changedBecause, explanation };
}

/** What the trader reads: the answer first, then the one limit that decides it. Engine figures only. */
function plainExplanation(t: (typeof T)[Lang], res: SoundingResult, c: Constraints, rec: string | null, excluded: AnalystOutput["excluded"], clarification: string | null, hardExit: boolean, userFee?: { feeBps: number; allInBps?: string }): string {
  if (clarification) return t.first(clarification);
  const worst = [...(res.fees ?? [])].filter((f) => f.source === "scenario").sort((a, b) => b.feeBps - a.feeBps)[0];
  const row = userFee ?? worst;
  const fee = row ? t.fee(row.feeBps, !!userFee) : t.feeAny;
  const ruledOut = excluded.filter((e) => e.kind !== "immediate_cross").map((e) => t.say[e.kind]).join(t.and);
  const deadline = hardExit && c.hardDeadlineNy ? t.deadline(c.hardDeadlineNy, ruledOut) : "";
  if (rec === "immediate_cross" && row?.allInBps) return t.cross(row.allInBps, fee, res.ceilingBps, deadline);
  if (rec) return t.other(res.ceilingBps, fee, t.say[rec] ?? rec, deadline);
  if (hardExit) return t.noExit(res.ceilingBps, fee);
  return t.nothing(res.ceilingBps, fee);
}
