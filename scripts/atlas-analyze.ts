// At-size market atlas: the analysis declared in evidence/atlas-202610/SCHEDULE.md, run with Sounding's own walk.
// Usage: pnpm exec tsx scripts/atlas-analyze.ts [rawDir=evidence/atlas-202610/raw] [out=evidence/atlas-202610/ATLAS.json]
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";
import { buyWithBudget, sellShares, validateBook } from "../src/engine/book";
import { classifySession } from "../src/engine/session";
import { D } from "../src/engine/types";
import { allInBps, allInFrom } from "../src/engine/cost";
import { DEFAULT_FEE_SCENARIOS_BPS } from "../src/engine/fees";

const [dir = "evidence/atlas-202610/raw", out = "evidence/atlas-202610/ATLAS.json"] = process.argv.slice(2);
const SIZES = [1000, 5000, 25000];
// Amended 2026-10-07 (SCHEDULE.md): Bitget's published rToken fee and the list rate before it, charged on traded notional.
const FEES = DEFAULT_FEE_SCENARIOS_BPS;
const [FEE, LIST] = [FEES[0], FEES[FEES.length - 1]];
const CEILINGS = [30, 50];
type Raw = { data: { asks: [string, string][]; bids: [string, string][]; ts: string } };
interface Book { symbol: string; status: number; body?: Raw; offset_s?: number; error?: string }
interface Round { round: number; started_utc: string; host?: string; eligible: string[]; states: { body?: { data: unknown } }; calendar: { body?: { data: unknown } }; books: Book[]; flip: { books: Book[] } }

/**
 * The full order and the best level, all-in at a fee, bps vs mid; sells are sized to the same notional at mid.
 * null: the book is invalid. full null: the book is too thin to fill the whole order.
 */
function costs(raw: Raw, side: "buy" | "sell", notional: number) {
  const v = validateBook(raw as never);
  if (!v.valid) return null;
  const leg = side === "buy" ? buyWithBudget(raw as never, String(notional), v.mid) : sellShares(raw as never, D(notional).div(v.mid).toDecimalPlaces(4, 1).toString(), v.mid);
  const top = side === "buy" ? v.bestAsk.minus(v.mid).div(v.mid).mul(10000) : v.mid.minus(v.bestBid).div(v.mid).mul(10000);
  return { full: (fee: number) => (leg.status === "OK" ? allInBps(leg, fee) : null), top: (fee: number) => allInFrom(top, fee, side) };
}

const files = readdirSync(dir).filter((f) => f.endsWith(".json.gz")).sort();
const cells = new Map<string, { snapshots: number; invalid: number; insufficient: number; overAtSize: number; topYesSizeNo: number; feeFlip: number }>();
// pairs/changed: priced at both captures. toUnpriced: priced first, then invalid or too thin on the re-capture.
const flips = new Map<string, { pairs: number; changed: number; toUnpriced: number }>();
const gaps = new Map<string, number[]>();
const rounds: { round: number; started_utc: string; host?: string; session: string; books: number; failed: number; transportFailed: number; apiError: number; metadataFailed: boolean }[] = [];
const bump = <T extends object>(m: Map<string, T>, k: string, init: T) => m.get(k) ?? (m.set(k, init), m.get(k)!);

for (const f of files) {
  const r = JSON.parse(gunzipSync(readFileSync(join(dir, f))).toString()) as Round;
  const states = r.states.body?.data as never, calendar = r.calendar.body?.data as never;
  const session = classifySession(new Date(r.started_utc), states ? { stateList: (states as { stateList?: unknown }).stateList ?? states } as never : null, calendar).state;
  const ok = r.books.filter((b) => b.status === 200 && b.body);
  // A round whose Bitget metadata could not be read has no universe; it is an outage, not a liquidity observation.
  const metadataFailed = !r.eligible.length;
  rounds.push({ round: r.round, started_utc: r.started_utc, host: r.host, session: metadataFailed ? "metadata_outage" : session, books: r.books.length, failed: r.books.length - ok.length, transportFailed: r.books.filter((b) => b.status === 0).length, apiError: r.books.filter((b) => b.status !== 0 && b.status !== 200).length, metadataFailed });
  if (metadataFailed) continue;
  for (const b of ok) for (const side of ["buy", "sell"] as const) for (const size of SIZES) {
    const c = costs(b.body!, side, size);
    for (const ceil of CEILINGS) {
      const cell = bump(cells, `${session}|${side}|${size}|${ceil}`, { snapshots: 0, invalid: 0, insufficient: 0, overAtSize: 0, topYesSizeNo: 0, feeFlip: 0 });
      cell.snapshots++;
      if (!c) { cell.invalid++; continue; }
      const full = c.full(FEE), atList = c.full(LIST);
      if (!full || !atList) { cell.insufficient++; continue; }
      if (full.gt(ceil)) cell.overAtSize++;
      if (c.top(FEE).lte(ceil) && full.gt(ceil)) cell.topYesSizeNo++;
      if (full.lte(ceil) && atList.gt(ceil)) cell.feeFlip++;
    }
  }
  // Verdict change between a name's first capture and its re-capture at +5/+15/+30 s, at 5,000 USDT, each fee, 50 bps.
  const first = new Map(ok.map((b) => [b.symbol, b.body!]));
  for (const b of r.flip.books.filter((x) => x.status === 200 && x.body)) {
    const a = first.get(b.symbol);
    if (!a) continue;
    // The re-read is scheduled after the whole sweep, so the gap is measured from the two exchange timestamps, not assumed.
    bump(gaps, `+${b.offset_s}s`, [] as number[]).push((Number(b.body!.data.ts) - Number(a.data.ts)) / 1000);
    for (const side of ["buy", "sell"] as const) for (const fee of FEES) {
      const c0 = costs(a, side, 5000)?.full(fee), c1 = costs(b.body!, side, 5000)?.full(fee);
      if (!c0) continue;
      const k = bump(flips, `${session}|${side}|+${b.offset_s}s|fee${fee}`, { pairs: 0, changed: 0, toUnpriced: 0 });
      if (!c1) { k.toUnpriced++; continue; }
      k.pairs++;
      if (c0.lte(50) !== c1.lte(50)) k.changed++;
    }
  }
}

const result = {
  schedule: "evidence/atlas-202610/SCHEDULE.md", rounds: rounds.filter((r) => !r.metadataFailed).length, attemptedRounds: rounds.length, metadataOutageRounds: rounds.filter((r) => r.metadataFailed).length,
  first: rounds[0]?.started_utc, last: rounds.at(-1)?.started_utc,
  bySession: Object.fromEntries([...new Set(rounds.filter((r) => !r.metadataFailed).map((r) => r.session))].map((s) => [s, rounds.filter((r) => r.session === s).length])),
  failedBooks: rounds.reduce((t, r) => t + r.failed, 0), transportFailed: rounds.reduce((t, r) => t + r.transportFailed, 0), apiError: rounds.reduce((t, r) => t + r.apiError, 0), totalBooks: rounds.reduce((t, r) => t + r.books, 0),
  fees: { decides: FEE, list: LIST, charged: "on traded notional" }, hosts: [...new Set(rounds.map((r) => r.host ?? "local"))],
  cells: Object.fromEntries([...cells].map(([k, v]) => [k, v])),
  flips: Object.fromEntries([...flips].map(([k, v]) => [k, v])),
  rereadSeconds: Object.fromEntries([...gaps].map(([k, v]) => { const x = [...v].sort((p, q) => p - q), at = (f: number) => Number(x[Math.min(x.length - 1, Math.floor(f * x.length))].toFixed(1)); return [k, { pairs: x.length, min: at(0), median: at(0.5), p95: at(0.95), max: at(1) }]; })),
  roundsDetail: rounds,
};
writeFileSync(out, JSON.stringify(result, null, 1));
console.log(JSON.stringify({ rounds: result.rounds, bySession: result.bySession, failedBooks: result.failedBooks, totalBooks: result.totalBooks }));
