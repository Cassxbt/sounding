import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buyWithBudget, validateBook } from "@/engine/book";
import { D } from "@/engine/types";
import type { RawOrderbook } from "@/engine/types";

/** One stored snapshot of the 90 weekend-tradable books, recomputed with Sounding's own walk at build. */
const CENSUS = "evidence/census-20260920/eligible-census-RAW-20260920T0902Z.json";

export interface CensusCell { budget: number; ceiling: number; priced: number; feeFlip: number; topYesSizeNo: number; overAtSize: number }

export function census(): { captured_utc: string; names: number; cells: CensusCell[]; lead: { median: string; inversions: string[] } } {
  const c = JSON.parse(readFileSync(join(process.cwd(), CENSUS), "utf8")) as { captured_utc: string; rows: { symbol: string; raw: RawOrderbook }[] };
  const cells: CensusCell[] = [];
  let median = "", inversions: string[] = [];
  for (const budget of [1000, 5000, 25000]) for (const ceiling of [30, 50]) {
    const cell = { budget, ceiling, priced: 0, feeFlip: 0, topYesSizeNo: 0, overAtSize: 0 };
    const all: number[] = []; const inv: string[] = [];
    for (const r of c.rows) {
      const v = validateBook(r.raw);
      if (!v.valid) continue;
      const leg = buyWithBudget(r.raw, String(budget), v.mid);
      if (leg.status !== "OK") continue;
      cell.priced++;
      const pre = D(leg.bpsPreFeeExact!), top = v.bestAsk.minus(v.mid).div(v.mid).mul(10000);
      all.push(pre.plus(20).toNumber());
      if (pre.plus(10).lte(ceiling) && pre.plus(20).gt(ceiling)) cell.feeFlip++;
      if (pre.plus(20).gt(ceiling)) cell.overAtSize++;
      if (top.plus(20).lte(ceiling) && pre.plus(20).gt(ceiling)) { cell.topYesSizeNo++; inv.push(r.symbol.replace(/^R|USDT$/g, "")); }
    }
    cells.push(cell);
    if (budget === 5000 && ceiling === 50) {
      all.sort((a, b) => a - b);
      median = (all.length % 2 ? all[(all.length - 1) / 2] : (all[all.length / 2 - 1] + all[all.length / 2]) / 2).toFixed(2);
      inversions = inv;
    }
  }
  return { captured_utc: c.captured_utc, names: c.rows.length, cells, lead: { median, inversions } };
}

export interface AtlasSummary { rounds: number; attemptedRounds?: number; metadataOutageRounds?: number; first?: string; last?: string; bySession: Record<string, number>; failedBooks: number; totalBooks: number; cells: Record<string, { snapshots: number; insufficient: number; overAtSize: number; topYesSizeNo: number; feeFlip10to20: number }>; flips: Record<string, { pairs: number; changed: number }> }

/** The repeated atlas, as last analysed (scripts/atlas-analyze.ts); absent until the first analysis is committed. */
export function atlas(): AtlasSummary | null {
  const p = join(process.cwd(), "evidence/atlas-202610/ATLAS.json");
  return existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as AtlasSummary) : null;
}
