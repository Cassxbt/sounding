import type { Constraints } from "./schema";
import { qwenJson, qwenAvailable, INTAKE_TIMEOUT_MS } from "./qwen";
import { EARLIEST, readBps, readDate, readQty, spanInText } from "./normalize";
import { extractConstraints } from "./extract";

/**
 * Checked intake: Qwen reads the trader's words, code checks them.
 * Every value Qwen proposes must cite a span that literally occurs in the message. Code then reads the span
 * itself; if code and Qwen disagree, the field is held and one clarification is asked. Where code cannot read
 * the phrase, the cited span is the guarantee and the value is labelled as model-read.
 */

export type FieldName = "takerFeeBps" | "ceilingBps" | "hardDeadlineNy" | "mustBeFlat" | "releaseDeadline" | "sizeShares" | "sizeQuoteUsdt" | "thesis";

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
- takerFeeBps: their trading fee, converted to basis points (0.08% = 8, 8bp = 8, 千分之0.8 = 8)
- ceilingBps: the maximum all-in cost they accept, in basis points (half a percent = 50)
- hardDeadlineNy: the last NY date on which they may still trade, as YYYY-MM-DD (today is TODAY). "by the 8th" = the 8th; "before the 8th" = the 7th. The span must include the word (by, before, 之前) that sets it
- mustBeFlat: true only if they say they MUST be out/done by that date
- releaseDeadline: true only if they say a previous deadline no longer applies (e.g. "I can hold through")
- sizeShares: a share quantity they want to trade, as a decimal string
- sizeQuoteUsdt: a USDT amount they want to spend, as a decimal string
- thesis: their stated reason for the position, short
Return JSON: {"fields":[{"name":"takerFeeBps","value":8,"span":"I pay 0.08% taker"}, ...]}. Empty list if nothing is stated.`;

const NAMES: FieldName[] = ["takerFeeBps", "ceilingBps", "hardDeadlineNy", "mustBeFlat", "releaseDeadline", "sizeShares", "sizeQuoteUsdt", "thesis"];

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

export function checkFields(proposed: { name: string; value: unknown; span: string }[], text: string, today: string): IntakeField[] {
  const out: IntakeField[] = [];
  for (const p of proposed) {
    if (!NAMES.includes(p.name as FieldName) || p.value === null || p.value === undefined || typeof p.span !== "string") continue;
    const name = p.name as FieldName;
    const value = p.value as string | number | boolean;
    if (!spanInText(p.span, text)) { out.push({ name, value, span: p.span, source: "model", status: "rejected_span", note: "cited words are not in the message" }); continue; }
    if (name === "hardDeadlineNy") { out.push(checkDeadline(value, p.span, today)); continue; }
    const c = codeRead(name, p.span, today);
    if (c === undefined || c === null) { out.push({ name, value, span: p.span, source: "model", status: "accepted", note: c === null ? "code cannot read this phrase; span verified" : undefined }); continue; }
    if (same(c, value)) out.push({ name, value: c, span: p.span, source: "model+code", status: "accepted" });
    else out.push({ name, value, span: p.span, source: "model", status: "conflict", note: `code reads ${String(c)}` });
  }
  return out;
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
  }
  return r;
}

function clarify(fields: IntakeField[]): string | null {
  const conflict = fields.find((f) => f.status === "conflict");
  if (!conflict) return null;
  const label: Record<FieldName, string> = { takerFeeBps: "your taker fee", ceilingBps: "your cost ceiling", hardDeadlineNy: "your deadline", mustBeFlat: "whether you must be out", releaseDeadline: "the deadline", sizeShares: "the share quantity", sizeQuoteUsdt: "the USDT amount", thesis: "your thesis" };
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
