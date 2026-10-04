import Decimal from "decimal.js";
/**
 * Code-side readers for the phrases traders actually type. Each returns a value or null; null means
 * "code cannot read this phrase", never a guess. Used to check every span Qwen extracts.
 */

const NUM_WORDS: Record<string, number> = { half: 0.5, quarter: 0.25, "three quarters": 0.75, one: 1, a: 1, two: 2, three: 3 };

const CN_DIGITS: Record<string, number> = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };

/** Chinese numerals up to 99 with an optional decimal: 六, 十五, 三十五, 零点八. */
function cnNumber(t: string): string {
  const [int, frac] = t.split("点");
  let n = 0;
  if (int.includes("十")) { const [tens, ones] = int.split("十"); n = (tens ? CN_DIGITS[tens] : 1) * 10 + (ones ? CN_DIGITS[ones] : 0); }
  else n = int ? Number([...int].map((c) => CN_DIGITS[c]).join("")) : 0;
  return frac ? `${n}.${[...frac].map((c) => CN_DIGITS[c]).join("")}` : String(n);
}

/** Fee or cost in basis points: "8 bps", "8bp", "0.08%", "half a percent", "千分之0.8", "千分之六", "万8". */
export function readBps(span: string): number | null {
  const s = span.toLowerCase().replace(/,/g, "").replace(/[零一二两三四五六七八九十点]+/g, cnNumber).trim();
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

function dayAfter(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

const EXCLUSIVE = /\bbefore\b|\bprior to\b|\bahead of\b|前/;
const INCLUSIVE = /on or before|no later than|inclusive|[（(]含[)）]|含当天|最晚|最迟/;
/** "Not before the 8th" names the earliest day to act, not a deadline. */
export const EARLIEST = /not before|no earlier than|\bafter\b|不早于|之后|以后|前不|前别/;

export function readDate(span: string, today: string): string | null {
  const d = readNamedDate(span, today);
  const s = span.toLowerCase();
  return d && EXCLUSIVE.test(s) && !INCLUSIVE.test(s) ? dayBefore(d) : d;
}

const EN_DAYS: [RegExp, number][] = [[/\bsun(day)?\b/, 0], [/\bmon(day)?\b/, 1], [/\btue(s|sday)?\b/, 2], [/\bwed(nesday)?\b/, 3], [/\bthu(r|rs|rsday)?\b/, 4], [/\bfri(day)?\b/, 5], [/\bsat(urday)?\b/, 6]];
const ZH_DAYS: Record<string, number> = { 日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 };

/** A weekday name resolves to its next occurrence on or after today ("by Friday" said on a Friday is today). */
function readWeekday(s: string, today: string): string | null | undefined {
  if (/\bnext\s+(week|mon|tue|wed|thu|fri|sat|sun)|下(个)?(周|星期|礼拜)/.test(s)) return null;
  const zh = s.match(/(?:周|星期|礼拜)([一二三四五六日天])/);
  const target = zh ? ZH_DAYS[zh[1]] : EN_DAYS.find(([re]) => re.test(s))?.[1];
  if (target === undefined) return undefined;
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + ((target - d.getUTCDay() + 7) % 7));
  return d.toISOString().slice(0, 10);
}

function readNamedDate(span: string, today: string): string | null {
  const s = span.toLowerCase().trim();
  const [ty, tm, td] = today.split("-").map(Number);
  const fmt = (y: number, m: number, d: number) => (m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` : null);
  // Roll to next year only when the date is well past; a date passed days ago is kept so it can be asked back.
  const withYear = (m: number, d: number) => {
    const ago = (Date.UTC(ty, tm - 1, td) - Date.UTC(ty, m - 1, d)) / 86_400_000;
    return fmt(ago > 31 ? ty + 1 : ty, m, d);
  };
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
  if (/\btoday\b|今天|今日/.test(s)) return today;
  if (/\btomorrow\b|明天|明日/.test(s)) return dayAfter(today);
  const wd = readWeekday(s, today);
  if (wd !== undefined) return wd;
  x = s.match(/\b(\d{1,2})(?:st|nd|rd|th)\b/) ?? s.match(/(?<![月\d])(\d{1,2})[日号]/);
  if (x) {
    const d = Number(x[1]);
    return d >= td ? fmt(ty, tm, d) : tm === 12 ? fmt(ty + 1, 1, d) : fmt(ty, tm + 1, d);
  }
  return null;
}

/** A positive quantity: "178.4121", "35 shares", "1,000", "1.2k", "1万". */
export function readQty(span: string): string | null {
  const m = span.replace(/,/g, "").match(/(\d+(?:\.\d+)?)\s*(k\b|万)?/i);
  if (!m || !(Number(m[1]) > 0)) return null;
  return m[2] ? new Decimal(m[1]).mul(m[2] === "万" ? 10_000 : 1_000).toString() : m[1];
}

/** Whitespace- and case-insensitive containment, so a model cannot cite words the trader never typed. */
export function spanInText(span: string, text: string): boolean {
  const n = (v: string) => v.toLowerCase().replace(/\s+/g, " ").trim();
  return span.trim().length > 0 && n(text).includes(n(span));
}

const round = (v: number) => Math.round(v * 1e6) / 1e6;

export interface Listed { code: string; symbol: string }
const NOT_TICKERS = new Set(["USDT", "USD", "BPS", "BP", "NY", "UTC", "ETF", "AM", "PM", "OK", "CN", "EN", "VWAP", "API"]);
/** Words a trader writes in capitals for emphasis that are also listed codes; never read as an instrument. */
const COMMON_WORDS = new Set(["ALL", "IT", "NOW", "ON", "OUT", "LOW", "SO", "AT", "BE", "ARE", "FOR", "ANY", "CAN", "GO", "HE", "ONE", "BIG", "KEY", "REAL", "CASH", "MAIN", "FAST", "SAFE", "OPEN", "HOLD", "CLOSE", "BUY", "SELL", "FEE", "MAX", "CAP", "NEW", "TOP", "OR", "AND", "NO", "YES", "UP", "DOWN", "BY", "TO", "OF", "IN", "MY", "ME", "WE", "US", "PAY", "TAX", "EARN", "LIFE", "WELL", "GOOD", "BEST", "EAT", "RUN", "PLAY", "CAR", "HOME", "LOVE", "GAME", "MOVE", "TRUE", "TEAM"]);

/**
 * rToken symbols named in the words. Explicit forms ("rSPY", "RSPYUSDT") always count. A bare code ("SPY") or a
 * lower-case r-form ("rhims") counts only with `loose`, used when the model has already said that word is the
 * instrument; common words written in capitals never count.
 */
export function readSymbols(text: string, listed: Listed[], loose = false): string[] {
  const byCode = new Map(listed.map((l) => [l.code.toUpperCase(), l.symbol]));
  const found = new Set<string>();
  for (const t of text.match(/[A-Za-z][A-Za-z0-9.]{0,7}/g) ?? []) {
    const tok = t.replace(/\.$/, "");
    const candidates: string[] = [];
    if (/^R[A-Z]{2,}USDT$/i.test(tok)) candidates.push(tok.slice(1, -4).toUpperCase());
    else if (/^r[A-Z0-9]/.test(tok)) candidates.push(tok.slice(1));
    else if (loose && /^r[a-z]{3,}$/.test(tok)) candidates.push(tok.slice(1).toUpperCase());
    else if (loose && /^[A-Z][A-Z0-9.]{1,}$/.test(tok) && !COMMON_WORDS.has(tok)) { candidates.push(tok); if (/^R[A-Z]{2,}$/.test(tok)) candidates.push(tok.slice(1)); }
    for (const c of candidates) {
      if (NOT_TICKERS.has(c)) continue;
      const s = byCode.get(c.toUpperCase());
      if (s) { found.add(s); break; }
    }
  }
  return [...found];
}

/** r-tickers in the words that are not on Bitget's list ("rZZZZ"): named, so never silently replaced. */
export function unknownRTickers(text: string, listed: Listed[]): string[] {
  const codes = new Set(listed.map((l) => l.code.toUpperCase()));
  return [...new Set((text.match(/\br[A-Z][A-Z0-9]{1,6}\b/g) ?? []).filter((t) => !codes.has(t.slice(1))))];
}

/** One instrument value, from whatever form the model wrote it in. */
export function resolveSymbol(value: string, listed: Listed[]): string | null {
  const v = value.trim();
  if (listed.some((l) => l.symbol === v.toUpperCase())) return v.toUpperCase();
  return readSymbols(v, listed, true)[0] ?? (/^[a-z]+$/.test(v) ? readSymbols(`r${v}`, listed, true)[0] : undefined) ?? null;
}

const BUY = /\b(buy|buying|bought|purchase|long|accumulate)\b|买入|购买|加仓|买/i;
const SELL = /\b(sell|selling|dump|exit|close out|unload|offload|trim)\b|\bout of\b|卖出|清仓|减仓|平仓|抛|卖/i;
export function readSide(text: string): "buy" | "sell" | "both" | null {
  const b = BUY.test(text), s = SELL.test(text);
  return b && s ? "both" : b ? "buy" : s ? "sell" : null;
}

/** Words that mean a limit was stated. A cue with no value read is asked back, never defaulted. */
export const CUES = {
  takerFeeBps: /\b(taker|fees?|commission)\b|手续费|费率|吃单/i,
  ceilingBps: /\b(ceiling|cap|capped|all[- ]?in|at most|no more than|max(?:imum)?)\b|上限|不超过|最多|别超/i,
  hardDeadlineNy: /\b(?:by|before|until|deadline|prior to|ahead of|no later than)\s+(?:the\s+)?(?:\d|mon|tue|wed|thu|fri|sat|sun|today|tomorrow|tonight|end|next|oct|nov|dec|jan|feb|mar|apr|may|jun|jul|aug|sep)|\d{1,2}\s*[号日]|周[一二三四五六日天]|星期[一二三四五六日天]|礼拜|明天|今天|月底|截止/i,
  mustBeFlat: /\b(must|have to|has to|need to|needs to|gotta|got to)\b|必须|一定要/i,
} as const;
