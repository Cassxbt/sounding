export interface StockInfo { symbol: string; code: string; name: string; tradingPeriod: string[]; weekendTradable: "yes" | "no" }

export interface Eligibility {
  known: boolean;
  weekendTradable?: boolean;
  tradingPeriod?: string[];
  code?: string;
  name?: string;
}

export function eligibilityFor(symbol: string, info: StockInfo[] | null): Eligibility {
  if (!info) return { known: false };
  const row = info.find((r) => r.symbol === symbol);
  if (!row) return { known: false };
  return { known: true, weekendTradable: row.weekendTradable === "yes", tradingPeriod: row.tradingPeriod, code: row.code, name: row.name };
}
