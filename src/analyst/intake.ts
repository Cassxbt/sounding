import type { Constraints } from "./schema";
import { qwenJson, qwenAvailable, INTAKE_TIMEOUT_MS } from "./qwen";
import { CUES, EARLIEST, readBps, readDate, readQty, readSide, readSymbols, resolveSymbol, spanInText, type Listed } from "./normalize";
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
  for (const p of proposed) {
    if (!NAMES.includes(p.name as FieldName) || p.value === null || p.value === undefined || typeof p.span !== "string") continue;
    const name = p.name as FieldName;
    const value = p.value as string | number | boolean;
    if (!spanInText(p.span, text)) { out.push({ name, value, span: p.span, source: "model", status: "rejected_span", note: "cited words are not in the message" }); continue; }
    if (name === "hardDeadlineNy") { out.push(checkDeadline(value, p.span, today)); continue; }
    if (name === "symbol") { if (listed) out.push(checkSymbol(String(value), p.span, listed)); continue; }
    if (name === "side") { out.push(checkSide(String(value), p.span)); continue; }
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

function checkSymbol(value: string, span: string, listed: Listed[]): IntakeField {
  const base = { name: "symbol" as const, value, span, source: "model" as const };
  const model = resolveSymbol(value, listed);
  const code = readSymbols(span, listed);
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
  if (!out.some((f) => f.name === "symbol")) {
    const syms = readSymbols(text, listed);
    if (syms.length === 1) out.push({ name: "symbol", value: syms[0], span: syms[0], source: "code", status: "accepted", note: "read by code from your message" });
    else if (syms.length > 1) out.push({ name: "symbol", value: syms.join(", "), span: syms.join(", "), source: "code", status: "conflict", note: "more than one instrument is named" });
  }
  if (!out.some((f) => f.name === "side")) {
    const side = readSide(text);
    if (side === "buy" || side === "sell") out.push({ name: "side", value: side, span: side, source: "code", status: "accepted", note: "read by code from your message" });
    else if (side === "both") out.push({ name: "side", value: "buy and sell", span: "buy and sell", source: "code", status: "conflict", note: "these words say both buy and sell" });
  }
}

/** A limit the words mention but no reader produced is a question, not a default. */
function missingLimits(out: IntakeField[], text: string) {
  const ok = (n: FieldName) => out.some((f) => f.name === n && (f.status === "accepted" || f.status === "rejected_meaning" || f.status === "conflict"));
  const released = out.some((f) => f.name === "releaseDeadline" && f.status === "accepted");
  for (const [name, cue] of Object.entries(CUES) as [keyof typeof CUES, RegExp][]) {
    const m = text.match(cue);
    if (!m || ok(name) || ((name === "hardDeadlineNy" || name === "mustBeFlat") && released)) continue;
    if (name === "mustBeFlat" && !ok("hardDeadlineNy") && !CUES.hardDeadlineNy.test(text)) continue;
    out.push({ name, value: "", span: m[0], source: "code", status: "conflict", note: "mentioned but not read" });
  }
}

/** A deadline is never taken on the model's word: code must read the same date, and it must not have passed. */
function checkDeadline(value: string | number | boolean, span: string, today: string): IntakeField {
  const base = { name: "hardDeadlineNy" as const, value, span, source: "model" as const };
  if (EARLIEST.test(span.toLowerCase())) return { ...base, status: "rejected_meaning", note: "an earliest date to act, not a deadline" };
  const c = readDate(span, today);
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

function clarify(fields: IntakeField[]): string | null {
  const order: FieldName[] = ["symbol", "side", "sizeShares", "sizeQuoteUsdt", "takerFeeBps", "ceilingBps", "hardDeadlineNy", "mustBeFlat", "releaseDeadline", "thesis"];
  const conflict = fields.filter((f) => f.status === "conflict").sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name))[0];
  if (!conflict) return null;
  const label: Record<FieldName, string> = { symbol: "the instrument", side: "whether you are buying or selling", takerFeeBps: "your taker fee", ceilingBps: "your cost ceiling", hardDeadlineNy: "your deadline", mustBeFlat: "whether you must be out", releaseDeadline: "the deadline", sizeShares: "the share quantity", sizeQuoteUsdt: "the USDT amount", thesis: "your thesis" };
  if (conflict.note === "mentioned but not read") return `You mentioned ${label[conflict.name]} ("${conflict.span}") but I could not read it. What is ${label[conflict.name]}, exactly?`;
  if (conflict.name === "symbol" && conflict.note === "more than one instrument is named") return `Your message names more than one instrument (${conflict.value}). Which one is this order for?`;
  if (conflict.name === "side" && conflict.note === "these words say both buy and sell") return "Your message says both buy and sell. Is this order a buy or a sell?";
  if (conflict.note?.startsWith("code reads ")) return `I read "${conflict.span}" two ways (${conflict.value} vs ${conflict.note.replace("code reads ", "")}). What is ${label[conflict.name]}, exactly?`;
  return `I could not use "${conflict.span}" as ${label[conflict.name]}: ${conflict.note}. What is ${label[conflict.name]}, exactly?`;
}

/** Regex-only reading: the baseline arm, and the fallback when Qwen is unavailable. */
export function regexIntake(text: string, prior: Constraints): Intake {
  const x = extractConstraints(text, prior);
  return { constraints: x.constraints, sizeShares: x.sizeShares, sizeQuoteUsdt: x.sizeQuote, fields: [], clarification: null, reader: "regex" };
}

export async function intake(text: string, prior: Constraints, todayNy: string, mode: "model" | "template" = "model"): Promise<Intake> {
  if (mode === "template" || !qwenAvailable() || !text.trim()) return regexIntake(text, prior);
  try {
    const { json } = await qwenJson(SYSTEM.replace("TODAY", todayNy), text, "intake", INTAKE_TIMEOUT_MS);
    const proposed = (json as { fields?: { name: string; value: unknown; span: string }[] } | null)?.fields;
    if (!Array.isArray(proposed)) return regexIntake(text, prior);
    const fields = checkFields(proposed, text, todayNy);
    return { ...applyFields(prior, fields), fields, clarification: clarify(fields), reader: "qwen" };
  } catch {
    return regexIntake(text, prior);
  }
}
