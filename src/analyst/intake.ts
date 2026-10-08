import type { Constraints } from "./schema";
import { qwenJson, qwenAvailable, INTAKE_TIMEOUT_MS } from "./qwen";
import { around, canonicalText, costFigures, dayBefore, negatedRelease, CUES, EARLIEST, SIZE_CUE, readBps, replyLanguage, readDate, readQty, readSide, readSymbols, resolveSymbol, spanInText, unknownRTickers, type Listed } from "./normalize";
import { extractConstraints } from "./extract";

/**
 * Checked intake: Qwen reads the trader's words, code checks them.
 * Every value Qwen proposes must cite a span that literally occurs in the message. Code then reads the span
 * itself; if code and Qwen disagree, the field is held and one clarification is asked. Where code cannot read
 * the phrase, the cited span is the guarantee and the value is labelled as model-read.
 */

export type FieldName = "symbol" | "side" | "takerFeeBps" | "ceilingBps" | "hardDeadlineNy" | "mustBeFlat" | "releaseDeadline" | "sizeShares" | "sizeQuoteUsdt" | "thesis";

export interface IntakeField {
  name: FieldName;
  value: string | number | boolean;
  span: string;
  source: "code" | "model" | "model+code";
  status: "accepted" | "conflict" | "rejected_span" | "rejected_meaning";
  note?: string;
}

export interface Intake {
  constraints: Constraints;
  /** the order the words name, when they name one */
  symbol?: string;
  side?: "buy" | "sell";
  ceilingBps?: number;
  sizeShares?: string;
  sizeQuoteUsdt?: string;
  fields: IntakeField[];
  clarification: string | null;
  reader: "qwen" | "regex";
}

const SYSTEM = `You read one message from a trader about a Bitget rToken order and extract only what they literally stated.
For every field you return, "span" must be the exact words copied from the message that state it. Omit any field the message does not state. Never infer, never compute, never fill defaults.
Fields:
- symbol: the rToken or stock they name, exactly as written (e.g. "rSPY", "HIMS")
- side: "buy" or "sell", from their words
- takerFeeBps: their trading fee, converted to basis points (0.08% = 8, 8bp = 8, 千分之0.8 = 8)
- ceilingBps: the maximum all-in cost they accept, in basis points (half a percent = 50)
- hardDeadlineNy: the last NY date on which they may still trade, as YYYY-MM-DD (today is TODAY). "by the 8th" = the 8th; "before the 8th" = the 7th. The span must include the word (by, before, 之前) that sets it
- mustBeFlat: true only if they say they MUST be out/done by that date
- releaseDeadline: true only if they say a previous deadline no longer applies (e.g. "I can hold through")
- sizeShares: a share quantity they want to trade, as a decimal string
- sizeQuoteUsdt: a USDT amount they want to spend, as a decimal string
- thesis: their stated reason for the position, short
Return JSON: {"fields":[{"name":"takerFeeBps","value":8,"span":"I pay 0.08% taker"}, ...]}. Empty list if nothing is stated.`;

const NAMES: FieldName[] = ["symbol", "side", "takerFeeBps", "ceilingBps", "hardDeadlineNy", "mustBeFlat", "releaseDeadline", "sizeShares", "sizeQuoteUsdt", "thesis"];

/** Code's own reading of a span, for the fields code can read. undefined = code has no reader for this field. */
function codeRead(name: FieldName, span: string, today: string): string | number | boolean | null | undefined {
  switch (name) {
    case "takerFeeBps": case "ceilingBps": return readBps(span);
    case "hardDeadlineNy": return readDate(span, today);
    case "sizeShares": case "sizeQuoteUsdt": return readQty(span);
    default: return undefined;
  }
}

const same = (a: unknown, b: unknown) => (typeof a === "number" || typeof b === "number" ? Math.abs(Number(a) - Number(b)) < 1e-9 : String(a) === String(b));

export function checkFields(proposed: { name: string; value: unknown; span: string }[], text: string, today: string, listed?: Listed[]): IntakeField[] {
  const out: IntakeField[] = [];
  // A minus sign just outside the quoted words still belongs to the number the words quote.
  const signed = (span: string) => { const i = text.indexOf(span); return i > 0 && /(?:^|[^A-Za-z])[-−]\s*$/.test(text.slice(Math.max(0, i - 3), i)) && /^\s*\d/.test(span); };
  for (const p of proposed) {
    if (!NAMES.includes(p.name as FieldName) || p.value === null || p.value === undefined || typeof p.span !== "string") continue;
    const name = p.name as FieldName;
    const value = p.value as string | number | boolean;
    if (!spanInText(p.span, text)) { out.push({ name, value, span: p.span, source: "model", status: "rejected_span", note: "cited words are not in the message" }); continue; }
    if (name === "hardDeadlineNy") { out.push(checkDeadline(value, p.span, today, text)); continue; }
    if (name === "symbol") { if (listed) out.push(checkSymbol(String(value), p.span, listed)); continue; }
    if (name === "side") { out.push(checkSide(String(value), p.span)); continue; }
    if ((name === "takerFeeBps" || name === "ceilingBps") && (signed(p.span) || /[-−]\s*\d/.test(p.span))) { out.push({ name, value, span: p.span, source: "model", status: "conflict", note: "a negative figure" }); continue; }
    // A maker fee is not the taker fee the order pays: the words decide, whatever field the model used.
    if (name === "takerFeeBps") {
      const at = text.toLowerCase().indexOf(p.span.toLowerCase());
      const clause = at >= 0 ? around(text, at, true).text : p.span;
      if (MAKER.test(clause) && !/\btaker\b|吃单/i.test(clause)) { out.push({ name, value, span: p.span, source: "model", status: "conflict", note: "a maker fee" }); continue; }
    }
    // A typed size must be a positive number; "-100" or "0" is a question, never another size.
    if ((name === "sizeShares" || name === "sizeQuoteUsdt") && (/[-−]\s*\d/.test(p.span) || signed(p.span) || !(Number(String(value).replace(/,/g, "")) > 0))) {
      out.push({ name, value, span: p.span, source: "model", status: "conflict", note: "not a positive size" });
      continue;
    }
    // A size belongs to the unit its own words state, not to the field the model filed it under.
    if (name === "sizeShares" || name === "sizeQuoteUsdt") {
      const stated = unitOf(p.span, text);
      if (stated && stated !== name) { const v = readQty(p.span); if (v) { out.push({ name: stated, value: v, span: p.span, source: "code", status: "accepted", note: "unit read by code from the cited words" }); continue; } }
    }
    // "Not able to hold through" quotes the words of a release; the negation just before them keeps the deadline.
    if (name === "releaseDeadline" && negatedRelease(text, p.span)) { out.push({ name, value, span: p.span, source: "model", status: "rejected_meaning", note: "a negated release keeps the deadline" }); continue; }
    const c = codeRead(name, p.span, today);
    if (c === undefined || c === null) { out.push({ name, value, span: p.span, source: "model", status: "accepted", note: c === null ? "code cannot read this phrase; span verified" : undefined }); continue; }
    if (same(c, value)) out.push({ name, value: c, span: p.span, source: "model+code", status: "accepted" });
    else out.push({ name, value, span: p.span, source: "model", status: "conflict", note: `code reads ${String(c)}` });
  }
  if (listed) orderFromWords(out, text, listed);
  // "Need to be flat by Friday" with no deadline proposed: code reads the date from the must-be-flat words.
  const must = out.find((f) => f.name === "mustBeFlat" && f.status === "accepted" && f.value === true);
  if (must && !out.some((f) => f.name === "hardDeadlineNy") && !EARLIEST.test(must.span.toLowerCase())) {
    const d = readDate(must.span, today);
    if (d && d >= today) out.push({ name: "hardDeadlineNy", value: d, span: must.span, source: "code", status: "accepted", note: "read by code from the must-be-flat words" });
  }
  missingLimits(out, text);
  return out;
}

/** The unit a size's words state: inside the cited span, or the word right after it ("100" then "shares"). */
function unitOf(span: string, text: string): "sizeShares" | "sizeQuoteUsdt" | null {
  const i = text.toLowerCase().indexOf(span.toLowerCase());
  const words = span + (i >= 0 ? text.slice(i + span.length, i + span.length + 10).match(/^\s*\S+/)?.[0] ?? "" : "");
  const usdt = /usdt|\bu\b|美元|刀/i.test(words), shares = /\bshares?\b|\bsh\b|股/i.test(words);
  return usdt === shares ? null : usdt ? "sizeQuoteUsdt" : "sizeShares";
}

function checkSymbol(value: string, span: string, listed: Listed[]): IntakeField {
  const base = { name: "symbol" as const, value, span, source: "model" as const };
  const model = resolveSymbol(value, listed);
  const code = readSymbols(span, listed, true);
  if (!model) return { ...base, status: "conflict", note: "not an instrument on Bitget's list" };
  if (code.length === 1 && code[0] === model) return { ...base, value: model, source: "model+code", status: "accepted" };
  return { ...base, status: "conflict", note: code.length ? `code reads ${code.join(", ")}` : "code cannot find that instrument in these words" };
}

function checkSide(value: string, span: string): IntakeField {
  const base = { name: "side" as const, value, span, source: "model" as const };
  const code = readSide(span);
  if ((value === "buy" || value === "sell") && code === value) return { ...base, source: "model+code", status: "accepted" };
  return { ...base, status: "conflict", note: code === "both" ? "these words say both buy and sell" : code ? `code reads ${code}` : "code cannot read a side from these words" };
}

/** Code reads the order from the whole message when the model leaves it out; more than one reading is asked back. */
function orderFromWords(out: IntakeField[], text: string, listed: Listed[]) {
  // A message that names more than one instrument is one question, whichever one the model picked.
  // Looser readings count here because they can only add a question, never price an order.
  const picked = out.find((f) => f.name === "symbol" && f.status === "accepted");
  if (picked) {
    const codeOf = (sym: string) => listed.find((l) => l.symbol === sym)?.code ?? "";
    const loose = readSymbols(text, listed, true).filter((sym) => codeOf(sym).length >= 3);
    const named = new Set([...readSymbols(text, listed), ...loose, ...unknownRTickers(text, listed), String(picked.value)]);
    if (named.size > 1) Object.assign(picked, { status: "conflict", value: [...named].join(", "), source: "code", note: "more than one instrument is named" });
  }
  if (!out.some((f) => f.name === "symbol")) {
    const unknown = unknownRTickers(text, listed);
    if (unknown.length) { out.push({ name: "symbol", value: unknown.join(", "), span: unknown[0], source: "code", status: "conflict", note: "not an instrument on Bitget's list" }); return orderSide(out, text); }
    const syms = readSymbols(text, listed);
    if (syms.length === 1) out.push({ name: "symbol", value: syms[0], span: syms[0], source: "code", status: "accepted", note: "read by code from your message" });
    else if (syms.length > 1) out.push({ name: "symbol", value: syms.join(", "), span: syms.join(", "), source: "code", status: "conflict", note: "more than one instrument is named" });
  }
  orderSide(out, text);
}

function orderSide(out: IntakeField[], text: string) {
  if (!out.some((f) => f.name === "side")) {
    const side = readSide(text);
    if (side === "buy" || side === "sell") out.push({ name: "side", value: side, span: side, source: "code", status: "accepted", note: "read by code from your message" });
    else if (side === "both") out.push({ name: "side", value: "buy and sell", span: "buy and sell", source: "code", status: "conflict", note: "these words say both buy and sell" });
  }
}

/** Figures inside another accepted limit's quoted words belong to that limit. */
function unclaimed(out: IntakeField[], text: string, own: FieldName) {
  const claimed = out.filter((f) => f.status === "accepted" && f.name !== own && f.span).map((f) => { const i = text.toLowerCase().indexOf(f.span.toLowerCase()); return i < 0 ? null : [i, i + f.span.length] as const; }).filter((x): x is readonly [number, number] => !!x);
  return (figs: { at: number; raw: string; bps: number }[]) => figs.filter((g) => !claimed.some(([a, b]) => g.at >= a && g.at < b));
}

const MAKER = /\bmaker\b|挂单/i;
const CORRECTION = /不对|更正|改成|改为|实际上|其实|应该是|\bactually\b|\bsorry\b|no wait|\bcorrection\b|\binstead\b|\bi mean\b|现在/i;
const THIRD = /\b(?:buddy|friend|wife|husband|colleague|partner|brother|sister|boss|his|her|their)\b|老婆|老公|朋友|同事|哥们|别人|他的|她的|他们/i;
const FIRST = /\bI\b|\bI'm\b|\bme\b|\bmy\b(?!\s+(?:buddy|friend|wife|husband|colleague|partner|brother|sister|boss))|我(?!老婆|老公|朋友|同事|哥们)/i;

/** Which limit a figure belongs to: the nearest cue before it in its sentence. */
function owner(text: string, at: number): "takerFeeBps" | "ceilingBps" | "maker" | null {
  const s = around(text, at), head = text.slice(s.start, at);
  const last = (re: RegExp) => { let k = -1; for (const m of head.matchAll(new RegExp(re.source, re.flags.replace("g", "") + "g"))) k = m.index ?? -1; return k; };
  const cands = ([["takerFeeBps", last(CUES.takerFeeBps)], ["ceilingBps", last(CUES.ceilingBps)], ["maker", last(MAKER)]] as const).filter((c) => c[1] >= 0).sort((a, b) => b[1] - a[1]);
  return cands[0]?.[0] ?? null;
}

/** Two values for one limit are asked back: a restatement that disagrees, an undecided choice, or two ceilings stated. */
function contradictions(out: IntakeField[], text: string) {
  // Two accepted values for the same field are a question, never settled by which came first.
  for (const name of new Set(out.filter((f) => f.status === "accepted").map((f) => f.name))) {
    const same = out.filter((f) => f.name === name && f.status === "accepted");
    const values = [...new Set(same.map((f) => String(f.value)))];
    if (values.length > 1) for (const f of same) Object.assign(f, { status: "conflict", note: `two values: ${values.join(" and ")}` });
  }
  for (const name of ["takerFeeBps", "ceilingBps"] as const) {
    const f = out.find((x) => x.name === name && x.status === "accepted");
    if (!f) continue;
    const i = text.toLowerCase().indexOf(f.span.toLowerCase());
    if (i < 0) continue;
    const s = around(text, i);
    const other = name === "takerFeeBps" ? "ceilingBps" : "takerFeeBps";
    // Only a figure tied to this one as the same thing or an alternative ("6 bps, which is 0.1%", "6 or 10 bps")
    // contradicts it; a maker fee, someone else's fee or a corrected figure is a distinction the reader resolved.
    const tied = (g: { at: number; raw: string }) => {
      const [a, b] = g.at < i ? [g.at + g.raw.length, i] : [i + f.span.length, g.at];
      return b - a <= 25 && /which is|that is|i\.e\.|\bor\b|=|也就是|即|或者|或|\//i.test(text.slice(a, b));
    };
    // Two ceilings stated as ceilings ("cap 30bp, fee 8bp, cap 50bp") are a question unless one corrects the other.
    const restated = (g: { at: number; raw: string }) => name === "ceilingBps" && owner(text, g.at) === "ceilingBps" && !CORRECTION.test(text.slice(Math.min(g.at, i), Math.max(g.at, i)));
    const rival = unclaimed(out, text, name)(costFigures(s.text).map((g) => ({ ...g, at: g.at + s.start })))
      .filter((g) => !(g.at >= i && g.at < i + f.span.length) && Number(g.bps) !== Number(f.value) && owner(text, g.at) !== other && owner(text, g.at) !== "maker" && (tied(g) || restated(g)));
    if (rival.length) { Object.assign(f, { status: "conflict", note: `two figures: ${f.value} and ${rival.map((g) => g.bps).join(", ")} bps` }); continue; }
    // A figure after a correction ("5 bps, sorry, 8 bps", "5 bps，不对，是 8 bps") replaces this one: asked, never the first kept.
    const end = i + f.span.length;
    const corrected = unclaimed(out, text, name)(costFigures(text)).filter((g) => g.at >= end && g.at - end <= 40 && Number(g.bps) !== Number(f.value) && owner(text, g.at) !== other && owner(text, g.at) !== "maker" && CORRECTION.test(text.slice(end, g.at)));
    if (corrected.length) { Object.assign(f, { status: "conflict", note: `two figures: ${f.value} and ${corrected.map((g) => g.bps).join(", ")} bps` }); continue; }
    // An undecided choice ("20 还是 25", "20 or 25 bps") is a question, whichever number the reader took.
    const after = text.slice(i + f.span.length, i + f.span.length + 18).match(/^\s*(?:bps?|%|个?基点)?\s*(?:还是|或者|或|\bor\b|\/)\s*(\d+(?:\.\d+)?\s*(?:bps?\b|basis points?|个?基点|%)?)/i);
    const before = text.slice(Math.max(0, i - 18), i).match(/(\d+(?:\.\d+)?\s*(?:bps?\b|个?基点|%)?)\s*(?:还是|或者|或|\bor\b|\/)\s*$/i);
    const alt = (after?.[1] ?? before?.[1])?.trim();
    // The same figure in another unit ("8bp or 0.08%") is a restatement, not a choice.
    const altBps = alt ? (/[a-z%基点]/i.test(alt) ? readBps(alt) : Number(alt)) : null;
    if (alt && altBps !== null && Number(altBps) !== Number(f.value)) { Object.assign(f, { status: "conflict", note: `two figures: ${f.value} or ${alt}` }); continue; }
    // A fee quoted from a clause about someone else's account is theirs, not the trader's.
    // Only the words before the figure say whose fee it is; a trader naming themselves keeps it.
    const c = around(text, i, true), whose = text.slice(c.start, i + f.span.length);
    if (name === "takerFeeBps" && THIRD.test(whose.slice(0, whose.search(/\d/) >= 0 ? whose.search(/\d/) : undefined)) && !FIRST.test(whose.slice(0, whose.search(/\d/) >= 0 ? whose.search(/\d/) : undefined)))
      Object.assign(f, { status: "conflict", note: "someone else's fee" });
  }
}

/** A limit the words mention but no reader produced is a question, not a default. */
function missingLimits(out: IntakeField[], text: string) {
  contradictions(out, text);
  const ok = (n: FieldName) => out.some((f) => f.name === n && (f.status === "accepted" || f.status === "rejected_meaning" || f.status === "conflict"));
  const released = out.some((f) => f.name === "releaseDeadline" && f.status === "accepted");
  for (const [name, cue] of Object.entries(CUES) as [keyof typeof CUES, RegExp][]) {
    const m = text.match(cue);
    if (!m || ok(name) || ((name === "hardDeadlineNy" || name === "mustBeFlat") && released)) continue;
    // Naming a cost limit without a figure ("under the ceiling", "含手续费") states nothing new.
    if (name === "takerFeeBps" || name === "ceilingBps") {
      const c = around(text, m.index ?? 0, true);
      const end = (m.index ?? 0) + m[0].length;
      const d = text.slice(end, end + 12).search(/\d/);
      const bare = d >= 0 && d <= 8 && unclaimed(out, text, name)([{ at: end + d, raw: "", bps: 0 }]).length > 0;
      if (!bare && !unclaimed(out, text, name)(costFigures(c.text).map((g) => ({ ...g, at: g.at + c.start }))).length) continue;
    }
    if (name === "mustBeFlat" && !ok("hardDeadlineNy") && !CUES.hardDeadlineNy.test(text)) continue;
    out.push({ name, value: "", span: m[0], source: "code", status: "conflict", note: "mentioned but not read" });
  }
  // A size typed but not read as a positive number is asked; the controls' size is only for messages that state none.
  const size = text.match(SIZE_CUE);
  if (size && !out.some((f) => (f.name === "sizeShares" || f.name === "sizeQuoteUsdt") && (f.status === "accepted" || f.status === "conflict")))
    out.push({ name: /usdt|\bu\b/i.test(size[0]) ? "sizeQuoteUsdt" : "sizeShares", value: "", span: size[0].trim(), source: "code", status: "conflict", note: /[-−]\s*\d|(?<![\d.])0(?![\d.])/.test(size[0]) ? "not a positive size" : "mentioned but not read" });
}

/** A deadline is never taken on the model's word: code must read the same date, and it must not have passed. */
function checkDeadline(value: string | number | boolean, span: string, today: string, text = span): IntakeField {
  const base = { name: "hardDeadlineNy" as const, value, span, source: "model" as const };
  // A qualifier directly ahead of the quote ("before", "not before") and a year directly after it belong to the date;
  // nothing else around it does, so "sell after open, by Sep 22" and "目前…10月8日" read as written.
  const i = text.toLowerCase().indexOf(span.toLowerCase());
  const lead = i < 0 ? "" : text.slice(Math.max(0, i - 16), i).toLowerCase();
  const year = i < 0 ? "" : text.slice(i + span.length).match(/^,?\s+(?:19|20)\d{2}\b/)?.[0] ?? "";
  if (EARLIEST.test(span.toLowerCase()) || /\b(?:not before|no earlier than|after)\s+(?:the\s+)?$/.test(lead)) return { ...base, status: "rejected_meaning", note: "an earliest date to act, not a deadline" };
  const read = readDate(span + year, today);
  const c = read && /\b(?:before|prior to|ahead of)\s+(?:the\s+)?$/.test(lead) && !/\b(?:before|prior to|ahead of)\b/i.test(span) ? dayBefore(read) : read;
  if (!c) return { ...base, status: "conflict", note: "code cannot confirm a date from these words" };
  if (c < today) return { ...base, status: "conflict", note: `this date has already passed (code reads ${c})` };
  // Code is authoritative on a date it can read; its reading is used when the model's is past or later (looser).
  if (c !== String(value) && (String(value) < today || c < String(value)))
    return { ...base, value: c, source: "code", status: "accepted", note: `model read ${String(value)}; code's reading used` };
  if (c !== String(value)) return { ...base, status: "conflict", note: `code reads ${c}` };
  return { ...base, value: c, source: "model+code", status: "accepted" };
}

export function applyFields(prior: Constraints, fields: IntakeField[]): Omit<Intake, "fields" | "clarification" | "reader"> {
  const c: Constraints = { ...prior };
  const r: Omit<Intake, "fields" | "clarification" | "reader"> = { constraints: c };
  for (const f of fields.filter((x) => x.status === "accepted")) {
    if (f.name === "takerFeeBps") c.takerFeeBps = Number(f.value);
    else if (f.name === "ceilingBps") r.ceilingBps = Number(f.value);
    else if (f.name === "hardDeadlineNy") c.hardDeadlineNy = String(f.value);
    else if (f.name === "mustBeFlat" && f.value === true) c.mustBeFlat = true;
    else if (f.name === "releaseDeadline" && f.value === true) { c.mustBeFlat = false; c.hardDeadlineNy = null; }
    else if (f.name === "sizeShares") r.sizeShares = String(f.value);
    else if (f.name === "sizeQuoteUsdt") r.sizeQuoteUsdt = String(f.value);
    else if (f.name === "thesis") c.thesis = String(f.value);
    else if (f.name === "symbol") r.symbol = String(f.value);
    else if (f.name === "side" && (f.value === "buy" || f.value === "sell")) r.side = f.value;
  }
  return r;
}

function clarify(fields: IntakeField[], lang: "en" | "zh" = "en"): string | null {
  const order: FieldName[] = ["symbol", "side", "sizeShares", "sizeQuoteUsdt", "takerFeeBps", "ceilingBps", "hardDeadlineNy", "mustBeFlat", "releaseDeadline", "thesis"];
  const conflict = fields.filter((f) => f.status === "conflict").sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name))[0];
  if (!conflict) return null;
  const t = ASK[lang], label = t.label[conflict.name], { span, note } = conflict;
  if (note === "a negative figure") return t.negative(/^\s*[-−]/.test(span) ? span.trim() : `-${span}`, label);
  if (note === "not a positive size") return t.notSize(span, conflict.name === "sizeQuoteUsdt");
  if (note === "someone else's fee") return t.othersFee(span);
  if (note === "a maker fee") return t.maker(span);
  if (note === "bare ticker") return t.bareTicker(String(conflict.value));
  if (note?.startsWith("two values")) return t.twoValues(label, note.replace("two values: ", ""));
  if (note?.startsWith("two figures")) return t.twoFigures(label, note.replace("two figures: ", ""));
  if (note === "mentioned but not read") return t.unread(label, span);
  if (conflict.name === "symbol" && note === "more than one instrument is named") return t.instruments(String(conflict.value));
  if (conflict.name === "side" && note === "these words say both buy and sell") return t.bothSides;
  if (note?.startsWith("code reads ")) return t.twoReadings(span, String(conflict.value), note.replace("code reads ", ""), label);
  return t.other(span, label, note ?? "");
}

/** Every question intake can ask, in the trader's language. */
const ASK = {
  en: {
    label: { symbol: "the instrument", side: "whether you are buying or selling", takerFeeBps: "your taker fee", ceilingBps: "your cost ceiling", hardDeadlineNy: "your deadline", mustBeFlat: "whether you must be out", releaseDeadline: "the deadline", sizeShares: "the share quantity", sizeQuoteUsdt: "the USDT amount", thesis: "your thesis" } as Record<FieldName, string>,
    negative: (shown: string, l: string) => `"${shown}" is negative. What is ${l}, exactly?`,
    notSize: (span: string, usdt: boolean) => `"${span}" is not a size that can be traded. How many ${usdt ? "USDT do you want to spend" : "shares do you want to trade"}?`,
    othersFee: (span: string) => `"${span}" sounds like someone else's fee. What is your own taker fee, exactly?`,
    maker: (span: string) => `"${span}" reads as a maker fee, and crossing the book pays the taker fee. What is your taker fee, exactly?`,
    bareTicker: (v: string) => `Do you mean ${v}? Name the rToken (for example rHIMS) so the right book is read.`,
    twoValues: (l: string, v: string) => `Your message gives two different values for ${l} (${v}). Which is it?`,
    twoFigures: (l: string, v: string) => `Your message gives ${v} for ${l}. Which is it?`,
    unread: (l: string, span: string) => `You mentioned ${l} ("${span}") but I could not read it. What is ${l}, exactly?`,
    instruments: (v: string) => `Your message names more than one instrument (${v}). Which one is this order for?`,
    bothSides: "Your message says both buy and sell. Is this order a buy or a sell?",
    twoReadings: (span: string, a: string, b: string, l: string) => `I read "${span}" two ways (${a} vs ${b}). What is ${l}, exactly?`,
    other: (span: string, l: string, note: string) => `I could not use "${span}" as ${l}: ${note}. What is ${l}, exactly?`,
  },
  zh: {
    label: { symbol: "标的", side: "买入还是卖出", takerFeeBps: "你的 taker 费率", ceilingBps: "你的成本上限", hardDeadlineNy: "你的截止日期", mustBeFlat: "你是否必须退出", releaseDeadline: "截止日期", sizeShares: "股数", sizeQuoteUsdt: "USDT 金额", thesis: "你的交易理由" } as Record<FieldName, string>,
    negative: (shown: string, l: string) => `"${shown}" 是负数。${l}具体是多少？`,
    notSize: (span: string, usdt: boolean) => `"${span}" 不是可以交易的数量。你想${usdt ? "花多少 USDT" : "交易多少股"}？`,
    othersFee: (span: string) => `"${span}" 听起来是别人的费率。你自己的 taker 费率具体是多少？`,
    maker: (span: string) => `"${span}" 看起来是挂单（maker）费率，而立即吃单付的是 taker 费率。你的 taker 费率具体是多少？`,
    bareTicker: (v: string) => `你是指 ${v} 吗？请写明 rToken（例如 rHIMS），以便读取正确的订单簿。`,
    twoValues: (l: string, v: string) => `你的消息里${l}有两个不同的值（${v}）。是哪一个？`,
    twoFigures: (l: string, v: string) => `你的消息里${l}给了 ${v}。是哪一个？`,
    unread: (l: string, span: string) => `你提到了${l}（"${span}"），但我没能读出来。${l}具体是多少？`,
    instruments: (v: string) => `你的消息提到了不止一个标的（${v}）。这笔订单是哪一个？`,
    bothSides: "你的消息同时提到了买入和卖出。这笔订单是买入还是卖出？",
    twoReadings: (span: string, a: string, b: string, l: string) => `我对 "${span}" 有两种读法（${a} 和 ${b}）。${l}具体是多少？`,
    other: (span: string, l: string) => `我无法把 "${span}" 当作${l}。${l}具体是多少？`,
  },
};

/**
 * Regex-only reading: the baseline arm, and the fallback when Qwen is unavailable. Its readings pass the same
 * checks as the model's (sign, size, unit, a real calendar date, limits mentioned but not read), so a fallback can
 * ask but never price something the trader did not say.
 */
/**
 * The regex reader only prices a size it can see is the order: one figure, not a holding, a price or a share of
 * a position. Anything else is asked; the model reader handles the phrasing a regex cannot.
 */
function fallbackSizeDoubt(text: string): { name: "sizeShares" | "sizeQuoteUsdt"; span: string; note: string } | null {
  const unitOf = (u: string) => (/usdt|^u$|美元/i.test(u) ? "sizeQuoteUsdt" as const : "sizeShares" as const);
  const sized = [...text.matchAll(/(?<![\w.,])([-−]?\d[\d,]*(?:\.\d+)?)\s*(shares?\b|sh\b|股|usdt\b|u\b|美元)/gi)];
  const verbed = [...text.matchAll(/(?:\b(?:sell|buy|make it|change it to)|卖出?|买入?)\s*([-−]?\d[\d,]*(?:\.\d+)?)/gi)];
  const values = new Set([...sized, ...verbed].map((m) => Number(m[1].replace(/[,\s]/g, ""))));
  const first = sized[0] ?? verbed[0];
  if (!first) return null;
  const name = sized[0] ? unitOf(sized[0][2]) : "sizeShares";
  if (values.size > 1) return { name, span: [...values].join(" and "), note: `two values: ${[...values].join(" and ")}` };
  const before = text.slice(Math.max(0, (first.index ?? 0) - 24), first.index);
  if (/\b(?:i\s+(?:hold|have|own|got)|my|at|@|price|per|each)\b[^\d]{0,14}$|(?:我有|持有|价格)[^\d]{0,6}$/i.test(before)) return { name, span: first[0].trim(), note: "it reads as a holding or a price, not the order" };
  if (/\b(?:half|quarter|third|some|part)\b|一半|部分/i.test(text)) return { name, span: first[0].trim(), note: "it reads as part of a position, not a size" };
  return null;
}

export function regexIntake(text: string, prior: Constraints, today: string, listed?: Listed[]): Intake {
  const x = extractConstraints(text, prior);
  const fields = checkFields(x.proposed, text, today, listed).map((f) => (f.source === "code" ? f : { ...f, source: "code" as const }));
  const doubt = fallbackSizeDoubt(text);
  if (doubt) {
    for (const f of fields) if (f.name === "sizeShares" || f.name === "sizeQuoteUsdt") f.status = "rejected_meaning";
    fields.push({ name: doubt.name, value: "", span: doubt.span, source: "code", status: "conflict", note: doubt.note });
  }
  // A bare ticker ("HIMS") is read only when the model names it; the fallback asks rather than price the controls' symbol.
  if (listed && !fields.some((f) => f.name === "symbol")) {
    const loose = readSymbols(text, listed, true);
    if (loose.length) fields.push({ name: "symbol", value: loose.map((sym) => `r${listed.find((l) => l.symbol === sym)?.code ?? sym}`).join(", "), span: loose.join(", "), source: "code", status: "conflict", note: "bare ticker" });
  }
  // Readings no check covers come straight from the regex.
  const rest = { ...prior, exclusiveExposure: x.constraints.exclusiveExposure, proxyConsent: x.constraints.proxyConsent, thesis: x.constraints.thesis };
  return { ...applyFields(rest, fields), fields, clarification: clarify(fields, replyLanguage(text)), reader: "regex" };
}

export async function intake(text: string, prior: Constraints, todayNy: string, mode: "model" | "template" = "model", listed?: Listed[]): Promise<Intake> {
  text = canonicalText(text);
  if (mode === "template" || !qwenAvailable() || !text.trim()) return regexIntake(text, prior, todayNy, listed);
  try {
    const { json } = await qwenJson(SYSTEM.replace("TODAY", todayNy), text, "intake", INTAKE_TIMEOUT_MS);
    const proposed = (json as { fields?: { name: string; value: unknown; span: string }[] } | null)?.fields;
    if (!Array.isArray(proposed)) return regexIntake(text, prior, todayNy, listed);
    const fields = checkFields(proposed, text, todayNy, listed);
    return { ...applyFields(prior, fields), fields, clarification: clarify(fields, replyLanguage(text)), reader: "qwen" };
  } catch {
    return regexIntake(text, prior, todayNy, listed);
  }
}
