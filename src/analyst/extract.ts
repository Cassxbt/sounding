import type { Constraints } from "./schema";
import { dayBefore } from "./normalize";

export interface Proposal { name: string; value: unknown; span: string }

const MONTHS: Record<string, string> = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", sept: "09", oct: "10", nov: "11", dec: "12" };

/** Deterministic extraction used by the template arm. Regex-level, no inference; unknowns stay unknown. */
export function extractConstraints(text: string, prev: Constraints, year = 2026): { constraints: Constraints; sizeShares?: string; sizeQuote?: string; proposed: Proposal[] } {
  const t = text.toLowerCase();
  const c: Constraints = { ...prev };
  let sizeShares: string | undefined, sizeQuote: string | undefined;
  // What was read, with the exact words it was read from, so the same checks as the model's reading apply.
  const proposed: Proposal[] = [];
  const cite = (name: string, value: unknown, m: RegExpMatchArray, group = 0) => {
    const at = (m.index ?? 0) + m[0].indexOf(m[group]);
    proposed.push({ name, value, span: text.slice(at, at + m[group].length) });
  };

  // Every fee stated is cited, so a corrected or second fee is asked about instead of the first one winning.
  const fees = [...t.matchAll(/(?:taker\s*)?fee\s*(?:is|of|=|:)?\s*([-−]?\s*(\d+(?:\.\d+)?)\s*bps)/g), ...t.matchAll(/([-−]?\s*(\d+(?:\.\d+)?)\s*bps\s*(?:taker\s*)?fee)/g),
    ...t.matchAll(/(?:手续费|费率)\s*(?:是|为|:|：)?\s*([-−]?\s*(\d+(?:\.\d+)?)\s*(?:bps|个?基点))/g)];
  if (fees.length) c.takerFeeBps = Number(fees[0][2]);
  for (const fee of fees) cite("takerFeeBps", Number(fee[2]), fee, 1);

  const iso = t.match(/(deadline|by|before)\s*(?:is\s*)?(\d{4}-\d{2}-\d{2})/);
  const named = t.match(/(?:hard\s+deadline|deadline|flat\s+by|out\s+by|by|before)\s+(?:is\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sept|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:,?\s+(\d{4})\b)?/);
  if (iso) { c.hardDeadlineNy = iso[1] === "before" ? dayBefore(iso[2]) : iso[2]; cite("hardDeadlineNy", c.hardDeadlineNy, iso); }
  else if (named) {
    const d = `${named[3] ?? year}-${MONTHS[named[1]]}-${named[2].padStart(2, "0")}`;
    c.hardDeadlineNy = named[0].startsWith("before") ? dayBefore(d) : d;
    cite("hardDeadlineNy", c.hardDeadlineNy, named);
  }

  if (/must\s+be\s+(?:flat|out|filled)|hard\s+deadline|need\s+to\s+be\s+(?:flat|out)/.test(t)) c.mustBeFlat = true;
  const release = t.match(/(?<!\b(?:not|never|un)\s*)(?:can|could|able to)\s+hold\s+through|no\s+(?:longer\s+)?(?:a\s+)?deadline|deadline\s+(?:is\s+)?(?:gone|removed|off)|not\s+urgent/);
  if (release) { c.mustBeFlat = false; c.hardDeadlineNy = null; cite("releaseDeadline", true, release); }
  if (/only\s+(?:want\s+)?this\s+(?:company|stock|name)|only\s+[a-z]+\s+exposure|no\s+(?:etf|proxy|proxies)/.test(t)) c.exclusiveExposure = true;
  if (/(?:ok|fine|happy|consent)\s+(?:with|to)\s+(?:a\s+)?(?:proxy|etf|substitute)/.test(t)) c.proxyConsent = true;

  const thesis = text.match(/(?:on|because of|for)\s+the\s+([A-Za-z0-9\- ]{3,40}?)\s+thesis/i);
  if (thesis) c.thesis = thesis[1].trim();

  // "sell 178.412132 rHIMS", "make it 35 shares", "35 sh". The sign is kept in the cited words, so
  // "sell - 100 shares" or "0 USDT" reaches the size check as written and is asked, never priced.
  const num = String.raw`(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?`;
  const sh = t.match(new RegExp(String.raw`(?:make\s+it|change\s+(?:it\s+)?to|sell|buy)\s+(([-−]?\s*${num})(?![\w.])\s*(?:shares|sh|r[a-z]{1,6})\b)`)) ?? t.match(new RegExp(String.raw`(([-−]?\s*(?<![\w.,])${num})\s*(?:(?:shares|sh)\b|股))`));
  const q = t.match(new RegExp(String.raw`(([-−]?\s*(?<![\w.,])${num})\s*(?:usdt|u\b|美元|刀))`));
  if (sh) { const v = sh[2].replace(/[\s,]/g, ""); if (Number(v) > 0) sizeShares = v; cite("sizeShares", v, sh, 1); }
  // Read a USDT amount whatever the side; the route asks when it is the wrong unit for the order.
  else if (q) { const v = q[2].replace(/[\s,]/g, ""); if (Number(v) > 0) sizeQuote = v; cite("sizeQuoteUsdt", v, q, 1); }
  // Cited whenever said, so a restated requirement is read again rather than asked about.
  if (c.mustBeFlat) { const m = t.match(/must\s+be\s+(?:flat|out|filled)|hard\s+deadline|need\s+to\s+be\s+(?:flat|out)/); if (m) cite("mustBeFlat", true, m); }
  return { constraints: c, sizeShares, sizeQuote, proposed };
}
