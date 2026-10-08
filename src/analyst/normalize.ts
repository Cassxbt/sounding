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
  // A signed negative cost ("-8 bps") is never read as its unsigned number.
  if (/[-−]\s*\d/.test(span)) return null;
  const s = span.toLowerCase().replace(/,/g, "").replace(/[零一二两三四五六七八九十点]+/g, cnNumber).trim();
  let m = s.match(/(\d+(?:\.\d+)?)\s*(?:bps?|basis points?|基点)/);
  if (m) return Number(m[1]);
  m = s.match(/(\d+(?:\.\d+)?)\s*(?:%|percent|per cent)/);
  if (m) return round(Number(m[1]) * 100);
  m = s.match(/百分之\s*(\d+(?:\.\d+)?)/);
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

// 前 means "before" except inside words like 目前 (currently), 提前 (in advance) or 前天/前面.
const EXCLUSIVE = /\bbefore\b|\bprior to\b|\bahead of\b|(?<![目提])前(?![天面])/;
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
  // Only real calendar dates: "Feb 31" is not a date.
  const fmt = (y: number, m: number, d: number) => {
    if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
    const t = new Date(Date.UTC(y, m - 1, d));
    return t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` : null;
  };
  // Roll to next year only when the date is well past; a date passed days ago is kept so it can be asked back.
  const withYear = (m: number, d: number) => {
    const ago = (Date.UTC(ty, tm - 1, td) - Date.UTC(ty, m - 1, d)) / 86_400_000;
    return fmt(ago > 31 ? ty + 1 : ty, m, d);
  };
  let x = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (x) return fmt(Number(x[1]), Number(x[2]), Number(x[3]));
  // A year the trader writes is theirs: "Oct 8, 2027" is never rolled to this year.
  x = s.match(/(jan|feb|mar|apr|may|jun|jul|aug|sept|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+((?:19|20)\d{2})\b)?/);
  if (x) return x[3] ? fmt(Number(x[3]), MONTHS[x[1]], Number(x[2])) : withYear(MONTHS[x[1]], Number(x[2]));
  x = s.match(/(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sept|sep|oct|nov|dec)[a-z]*\.?(?:,?\s+((?:19|20)\d{2})\b)?/);
  if (x) return x[3] ? fmt(Number(x[3]), MONTHS[x[2]], Number(x[1])) : withYear(MONTHS[x[2]], Number(x[1]));
  x = s.match(/(?:(\d{4})\s*年\s*)?(\d{1,2})月(\d{1,2})[日号]/);
  if (x) return x[1] ? fmt(Number(x[1]), Number(x[2]), Number(x[3])) : withYear(Number(x[2]), Number(x[3]));
  x = s.match(/\b(\d{1,2})\/(\d{1,2})\b/);
  if (x) return withYear(Number(x[1]), Number(x[2]));
  x = s.match(/(?<![\d.])(\d{1,2})\.(\d{1,2})(?![\d%.])/);
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
  if (/[-−]\s*\d/.test(span)) return null;
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
const COMMON_WORDS = new Set(["ALL", "IT", "NOW", "ON", "OUT", "LOW", "SO", "AT", "BE", "ARE", "FOR", "ANY", "CAN", "GO", "HE", "ONE", "BIG", "KEY", "REAL", "CASH", "MAIN", "FAST", "SAFE", "OPEN", "HOLD", "CLOSE", "BUY", "SELL", "FEE", "MAX", "CAP", "NEW", "TOP", "OR", "AND", "NO", "YES", "UP", "DOWN", "BY", "TO", "OF", "IN", "MY", "ME", "WE", "US", "PAY", "TAX", "EARN", "LIFE", "WELL", "GOOD", "BEST", "EAT", "RUN", "PLAY", "CAR", "HOME", "LOVE", "GAME", "MOVE", "TRUE", "TEAM", "WAY", "SUN", "AIR", "ICE", "FLY", "BILL", "SNOW", "BOOT", "NICE", "WING", "SITE", "HAS", "AGO"]);

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
  ceilingBps: /\b(ceiling|cap|capped|all[- ]?in|at most|no more than|max(?:imum)?|under|below|within|between|up to|less than)\b|上限|不超过|最多|别超|以内|之内|控制在|低于/i,
  hardDeadlineNy: /\b(?:by|before|until|deadline|prior to|ahead of|no later than)\s+(?:the\s+)?(?:\d|mon|tue|wed|thu|fri|sat|sun|today|tomorrow|tonight|end|next|oct|nov|dec|jan|feb|mar|apr|may|jun|jul|aug|sep)|\d{1,2}[./]\d{1,2}\s*(?:之前|以前|前)|(?:\d{1,2}\s*[号日]|周[一二三四五六日天]|星期[一二三四五六日天]|礼拜[一二三四五六日天]|明天|今天|月底)\s*(?:前|之前|以前|内|之内|截止)|最晚|截止/i,
  mustBeFlat: /\b(must|have to|has to|need to|needs to|gotta|got to)\b|必须|一定要/i,
} as const;

/** Every cost figure written in a piece of text, with where it sits: "6 bps", "0.1%", "千分之五", "万8", "half a percent". */
export function costFigures(text: string): { at: number; raw: string; bps: number }[] {
  const re = /\d+(?:\.\d+)?\s*(?:bps?\b|basis points?|个?基点|%|percent|per cent)|百分之\s*[\d零一二两三四五六七八九十点.]+|千分之\s*[\d零一二两三四五六七八九十点.]+|万分之\s*[\d零一二两三四五六七八九十点]+|万\s*[\d零一二两三四五六七八九十]+|(?:half|quarter|three quarters) (?:a |of a )?(?:percent|per cent|%)/gi;
  const out: { at: number; raw: string; bps: number }[] = [];
  for (const m of text.matchAll(re)) {
    const bps = readBps(m[0]);
    // A percentage that follows a price move ("up 4.5%") is not a cost.
    const before = text.slice(Math.max(0, (m.index ?? 0) - 16), m.index).toLowerCase();
    const after = text.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 12).toLowerCase();
    const move = /\b(up|down|rose|fell|gained|lost|jumped|dropped|spread)\b|涨|跌|[+\-]\s*$/.test(before) || /^\s*(drop|rise|gain|move|jump|fall|rally|decline|swing|bounce)/.test(after);
    if (bps !== null && !move) out.push({ at: m.index ?? 0, raw: m[0], bps });
  }
  return out;
}

/** The sentence or clause around a position: what one figure can be compared against. */
export function around(text: string, at: number, clause = false): { start: number; text: string } {
  const marks = clause ? /[.。;；!?！？\n,，…]/ : /[.。;；!?！？\n…]/;
  // A full stop or comma between digits is part of a number ("0.1%", "1,000"), and a dot inside a word ("e.g", a URL) is not a boundary.
  const stop = (k: number) => marks.test(text[k]) && !((text[k] === "." || text[k] === ",") && /\d/.test(text[k - 1] ?? "") && /\d/.test(text[k + 1] ?? "")) && !(text[k] === "." && /[A-Za-z]/.test(text[k + 1] ?? ""));
  let s = at; while (s > 0 && !stop(s - 1)) s--;
  let e = at; while (e < text.length && !stop(e)) e++;
  return { start: s, text: text.slice(s, e) };
}

/** A size was typed: "sell 0 shares", "buy -5 rSPY", "1,000 USDT". Used to ask when no positive size was read. */
// A size in digits, in Chinese numerals or in English words: any of them is read, or asked, never replaced by the controls.
export const SIZE_CUE = /(?:\b(?:sell|buy)\b|卖出?|买入?)\s*[-−]?\s*\d[\w,.]*(?:\s*(?:shares?\b|sh\b|股|usdt\b|u\b|美元))?|[-−]?\d[\w,.]*\s*(?:shares?\b|sh\b|股|usdt\b|u\b|美元)|[零一二两三四五六七八九十百千万]+\s*(?:股|美元)|\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|hundred|thousand|couple|few|several|dozen)\b\s+(?:[a-z-]+\s+){0,2}(?:shares?|usdt|r[a-z]{2,6})\b/i;

/** The language a reply goes out in: the trader's, by the script most of their words are in. */
export function replyLanguage(text: string): "en" | "zh" {
  const cjk = (text.match(/[\u4e00-\u9fff]/g) ?? []).length;
  // Tickers and units are written in Latin letters whatever the language ("卖出 100 股 rHIMS").
  const latin = (text.replace(/\b(?:r[A-Za-z]{1,6}|[A-Z]{2,}(?:USDT)?|bps?|usdt|u|sh)\b/g, "").match(/[A-Za-z]/g) ?? []).length;
  return cjk > 0 && cjk * 2 >= latin ? "zh" : "en";
}

/**
 * One spelling for the characters a phone keyboard varies: full-width digits, minus, point and percent become ASCII,
 * and a decimal written without its leading zero (".5") gets one. Everything that reads the message reads this.
 */
export function canonicalText(text: string): string {
  return text
    .replace(/[\uFF10-\uFF19]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xFF10 + 48))
    .replace(/[\uFF0D\uFE63](?=\s*[\d.\uFF0E])/g, "-")
    .replace(/\uFF0E(?=\d)/g, ".")
    .replace(/\uFF05/g, "%")
    .replace(/(^|\s)[\u2010-\u2014](?=\s*\d)/g, "$1-")
    .replace(/(\d)\uFF0C(?=\d{3}(?!\d))/g, "$1,")
    .replace(/(^|[^\w.])([-\u2212]?)\.(\d)/g, "$1$20.$3");
}

const NEGATION = /\b(?:not|never|no way|no longer|doubt|unable|cannot|won't|wouldn't|couldn't|can't|don't|isn't)\b|n't\b|不能|无法|不可以|没法|不行/i;

/**
 * A release ("I can hold through", "not urgent") is negated when its own clause, read up to the phrase, says it isn't
 * so: "I don't think I'll be able to hold through". A release that is itself worded negatively is judged on the words
 * before it, so "it's not urgent anymore" still releases.
 */
export function negatedRelease(text: string, phrase: string): boolean {
  const i = text.toLowerCase().indexOf(phrase.toLowerCase());
  if (i < 0) return NEGATION.test(phrase);
  const before = text.slice(0, i), start = Math.max(...[".", "!", "?", ";", ",", "。", "！", "？", "；", "，"].map((c) => before.lastIndexOf(c))) + 1;
  const own = /^\s*(?:not|no)\b/i.test(phrase) ? "" : phrase;
  return NEGATION.test(before.slice(start) + " " + own);
}
