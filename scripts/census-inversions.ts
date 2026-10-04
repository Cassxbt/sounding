// Quote versus size, recomputed with Sounding's own engine walk from a stored census.
// Usage: pnpm exec tsx scripts/census-inversions.ts <census.json> [budgetUsdt=5000] [feeBps=20] [ceilingBps=50]
import { readFileSync } from "node:fs";
import { buyWithBudget, validateBook } from "../src/engine/book";
import { D } from "../src/engine/types";

const [file, budget = "5000", fee = "20", ceiling = "50"] = process.argv.slice(2);
const census = JSON.parse(readFileSync(file, "utf8")) as { captured_utc: string; rows: { symbol: string; raw: { data: { asks: [string, string][]; bids: [string, string][]; ts: string } } }[] };
const rows = census.rows.map((r) => {
  const v = validateBook(r.raw as never);
  if (!v.valid) return { symbol: r.symbol, invalid: v.detail };
  const leg = buyWithBudget(r.raw as never, budget, v.mid);
  const top = v.bestAsk.minus(v.mid).div(v.mid).mul(10000).plus(fee);
  const full = leg.status === "OK" ? D(leg.bpsPreFeeExact!).plus(fee) : null;
  return { symbol: r.symbol, top: top.toFixed(4), full: full?.toFixed(4) ?? "insufficient depth", topWithin: top.lte(ceiling), fullWithin: full !== null && full.lte(ceiling) };
});
const valid = rows.filter((r) => !("invalid" in r)) as { symbol: string; top: string; full: string; topWithin: boolean; fullWithin: boolean }[];
const over = valid.filter((r) => !r.fullWithin);
const inversions = valid.filter((r) => r.topWithin && !r.fullWithin);
const fulls = valid.filter((r) => r.full !== "insufficient depth").map((r) => Number(r.full)).sort((a, b) => a - b);
const median = fulls.length % 2 ? fulls[(fulls.length - 1) / 2] : (fulls[fulls.length / 2 - 1] + fulls[fulls.length / 2]) / 2;
console.log(JSON.stringify({ captured_utc: census.captured_utc, budgetUsdt: budget, feeBps: fee, ceilingBps: ceiling, names: rows.length, invalidBooks: rows.length - valid.length, overAtSize: over.length, topSaysYesSizeSaysNo: inversions.map((r) => ({ symbol: r.symbol, topBps: r.top, fullBps: r.full })), medianAllInBps: median.toFixed(4) }, null, 1));
