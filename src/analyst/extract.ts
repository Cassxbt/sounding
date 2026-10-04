import type { Constraints } from "./schema";
import { dayBefore } from "./normalize";

const MONTHS: Record<string, string> = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", sept: "09", oct: "10", nov: "11", dec: "12" };

/** Deterministic extraction used by the template arm. Regex-level, no inference; unknowns stay unknown. */
export function extractConstraints(text: string, prev: Constraints, year = 2026): { constraints: Constraints; sizeShares?: string; sizeQuote?: string } {
  const t = text.toLowerCase();
  const c: Constraints = { ...prev };
  let sizeShares: string | undefined, sizeQuote: string | undefined;

  const fee = t.match(/(?:taker\s*)?fee\s*(?:is|of|=|:)?\s*(\d+(?:\.\d+)?)\s*bps/) ?? t.match(/(\d+(?:\.\d+)?)\s*bps\s*(?:taker\s*)?fee/);
  if (fee) c.takerFeeBps = Number(fee[1]);

  const iso = t.match(/(deadline|by|before)\s*(?:is\s*)?(\d{4}-\d{2}-\d{2})/);
  const named = t.match(/(?:hard\s+deadline|deadline|flat\s+by|out\s+by|by)\s+(?:is\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sept|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})/);
  if (iso) c.hardDeadlineNy = iso[1] === "before" ? dayBefore(iso[2]) : iso[2];
  else if (named) c.hardDeadlineNy = `${year}-${MONTHS[named[1]]}-${named[2].padStart(2, "0")}`;

  if (/must\s+be\s+(?:flat|out|filled)|hard\s+deadline|need\s+to\s+be\s+(?:flat|out)/.test(t)) c.mustBeFlat = true;
  if (/(?:can|could|able to)\s+hold\s+through|no\s+(?:longer\s+)?(?:a\s+)?deadline|deadline\s+(?:is\s+)?(?:gone|removed|off)|not\s+urgent/.test(t)) { c.mustBeFlat = false; c.hardDeadlineNy = null; }
  if (/only\s+(?:want\s+)?this\s+(?:company|stock|name)|only\s+[a-z]+\s+exposure|no\s+(?:etf|proxy|proxies)/.test(t)) c.exclusiveExposure = true;
  if (/(?:ok|fine|happy|consent)\s+(?:with|to)\s+(?:a\s+)?(?:proxy|etf|substitute)/.test(t)) c.proxyConsent = true;

  const thesis = text.match(/(?:on|because of|for)\s+the\s+([A-Za-z0-9\- ]{3,40}?)\s+thesis/i);
  if (thesis) c.thesis = thesis[1].trim();

  // "sell 178.412132 rHIMS", "make it 35 shares", "35 sh"
  const sh = t.match(/(?:make\s+it|change\s+(?:it\s+)?to|sell|buy)\s+(\d+(?:\.\d+)?)\s*(?:shares|sh|r[a-z]{1,6})\b/) ?? t.match(/(\d+(?:\.\d+)?)\s*(?:shares|sh)\b/);
  const q = t.match(/((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)\s*usdt/);
  if (sh) sizeShares = sh[1];
  else if (q && /budget|buy|spend/.test(t)) sizeQuote = q[1].replace(/,/g, "");
  return { constraints: c, sizeShares, sizeQuote };
}
