/**
 * Code-side readers for the phrases traders actually type. Each returns a value or null; null means
 * "code cannot read this phrase", never a guess. Used to check every span Qwen extracts.
 */

const NUM_WORDS: Record<string, number> = { half: 0.5, quarter: 0.25, "three quarters": 0.75, one: 1, a: 1, two: 2, three: 3 };

/** Fee or cost in basis points: "8 bps", "8bp", "0.08%", "half a percent", "千分之0.8", "万8". */
export function readBps(span: string): number | null {
  const s = span.toLowerCase().replace(/,/g, "").trim();
  let m = s.match(/(\d+(?:\.\d+)?)\s*(?:bps?|basis points?|基点)/);
  if (m) return Number(m[1]);
  m = s.match(/(\d+(?:\.\d+)?)\s*(?:%|percent|per cent)/);
  if (m) return round(Number(m[1]) * 100);
  m = s.match(/千分之\s*(\d+(?:\.\d+)?)/);
  if (m) return round(Number(m[1]) * 10);
  m = s.match(/万分之\s*(\d+(?:\.\d+)?)|万\s*(\d+(?:\.\d+)?)/);
  if (m) return Number(m[1] ?? m[2]);
  m = s.match(/(half|quarter|three quarters|one|two|three|a)\s+(?:a\s+)?(?:percent|per cent|%)/);
  if (m) return round(NUM_WORDS[m[1]] * 100);
  return null;
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

/**
 * A calendar date in New York: "2026-10-08", "Oct 8", "October 8th", "10/8", "the 8th", "10月8日".
 * A bare day ("the 8th") resolves to its next occurrence on or after `today` (YYYY-MM-DD, NY).
 */
/** The NY date before an ISO date. "Out before the 8th" leaves the 7th as the last day: the stricter reading of a hard exit. */
export function dayBefore(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

const EXCLUSIVE = /\bbefore\b|之前|以前/;

export function readDate(span: string, today: string): string | null {
  const d = readNamedDate(span, today);
  return d && EXCLUSIVE.test(span.toLowerCase()) ? dayBefore(d) : d;
}

function readNamedDate(span: string, today: string): string | null {
  const s = span.toLowerCase().trim();
  const [ty, tm, td] = today.split("-").map(Number);
  const fmt = (y: number, m: number, d: number) => (m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` : null);
  const withYear = (m: number, d: number) => fmt(m < tm || (m === tm && d < td) ? ty + 1 : ty, m, d);
  let x = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (x) return fmt(Number(x[1]), Number(x[2]), Number(x[3]));
  x = s.match(/(jan|feb|mar|apr|may|jun|jul|aug|sept|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?/);
  if (x) return withYear(MONTHS[x[1]], Number(x[2]));
  x = s.match(/(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sept|sep|oct|nov|dec)/);
  if (x) return withYear(MONTHS[x[2]], Number(x[1]));
  x = s.match(/(\d{1,2})月(\d{1,2})[日号]/);
  if (x) return withYear(Number(x[1]), Number(x[2]));
  x = s.match(/\b(\d{1,2})\/(\d{1,2})\b/);
  if (x) return withYear(Number(x[1]), Number(x[2]));
  x = s.match(/\b(\d{1,2})(?:st|nd|rd|th)\b/);
  if (x) {
    const d = Number(x[1]);
    return d >= td ? fmt(ty, tm, d) : tm === 12 ? fmt(ty + 1, 1, d) : fmt(ty, tm + 1, d);
  }
  return null;
}

/** A positive quantity: "178.4121", "35 shares", "1,000". */
export function readQty(span: string): string | null {
  const m = span.replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
  return m && Number(m[1]) > 0 ? m[1] : null;
}

/** Whitespace- and case-insensitive containment, so a model cannot cite words the trader never typed. */
export function spanInText(span: string, text: string): boolean {
  const n = (v: string) => v.toLowerCase().replace(/\s+/g, " ").trim();
  return span.trim().length > 0 && n(text).includes(n(span));
}

const round = (v: number) => Math.round(v * 1e6) / 1e6;
