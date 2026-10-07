import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buyWithBudget, validateBook } from "@/engine/book";
import { allInBps, allInFrom } from "@/engine/cost";
import { DEFAULT_FEE_SCENARIOS_BPS } from "@/engine/fees";
import type { RawOrderbook } from "@/engine/types";

/** One stored snapshot of the 90 weekend-tradable books, recomputed with Sounding's own walk at build. */
const CENSUS = "evidence/census-20260920/eligible-census-RAW-20260920T0902Z.json";

export interface CensusCell { budget: number; ceiling: number; priced: number; insufficient: number; feeFlip: number; topYesSizeNo: number; overAtSize: number }

/** Bitget's published rToken taker rate decides; the list rate before the promotion shows where the answer depends on it. */
export const CENSUS_FEE_BPS = DEFAULT_FEE_SCENARIOS_BPS[0];
export const CENSUS_LIST_FEE_BPS = DEFAULT_FEE_SCENARIOS_BPS[DEFAULT_FEE_SCENARIOS_BPS.length - 1];

export function census(): { captured_utc: string; names: number; cells: CensusCell[]; lead: { median: string; inversions: string[] } } {
  const c = JSON.parse(readFileSync(join(process.cwd(), CENSUS), "utf8")) as { captured_utc: string; rows: { symbol: string; raw: RawOrderbook }[] };
  const fee = CENSUS_FEE_BPS, list = CENSUS_LIST_FEE_BPS;
  const cells: CensusCell[] = [];
  let median = "", inversions: string[] = [];
  for (const budget of [1000, 5000, 25000]) for (const ceiling of [30, 50]) {
    const cell = { budget, ceiling, priced: 0, insufficient: 0, feeFlip: 0, topYesSizeNo: 0, overAtSize: 0 };
    const all: number[] = []; const inv: string[] = [];
    for (const r of c.rows) {
      const v = validateBook(r.raw);
      if (!v.valid) continue;
      const leg = buyWithBudget(r.raw, String(budget), v.mid);
      // A book too thin for the whole order is counted, never priced as if it were deep enough.
      if (leg.status !== "OK") { cell.insufficient++; continue; }
      cell.priced++;
      const full = allInBps(leg, fee), atList = allInBps(leg, list);
      const top = allInFrom(v.bestAsk.minus(v.mid).div(v.mid).mul(10000), fee, "buy");
      all.push(full.toNumber());
      if (full.lte(ceiling) && atList.gt(ceiling)) cell.feeFlip++;
      if (full.gt(ceiling)) cell.overAtSize++;
      if (top.lte(ceiling) && full.gt(ceiling)) { cell.topYesSizeNo++; inv.push(r.symbol.replace(/^R|USDT$/g, "")); }
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

export interface AtlasSummary { rounds: number; attemptedRounds?: number; metadataOutageRounds?: number; first?: string; last?: string; bySession: Record<string, number>; failedBooks: number; totalBooks: number; fees: { decides: number; list: number }; hosts: string[]; cells: Record<string, { snapshots: number; invalid: number; insufficient: number; overAtSize: number; topYesSizeNo: number; feeFlip: number }>; flips: Record<string, { pairs: number; changed: number; toUnpriced: number }> }

/** The repeated atlas, as last analysed (scripts/atlas-analyze.ts); absent until the first analysis is committed. */
export function atlas(): AtlasSummary | null {
  const p = join(process.cwd(), "evidence/atlas-202610/ATLAS.json");
  return existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as AtlasSummary) : null;
}
