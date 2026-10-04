// At-size market atlas: the analysis declared in evidence/atlas-202610/SCHEDULE.md, run with Sounding's own walk.
// Usage: pnpm exec tsx scripts/atlas-analyze.ts [rawDir=evidence/atlas-202610/raw] [out=evidence/atlas-202610/ATLAS.json]
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";
import { buyWithBudget, sellShares, validateBook } from "../src/engine/book";
import { classifySession } from "../src/engine/session";
import { D } from "../src/engine/types";

const [dir = "evidence/atlas-202610/raw", out = "evidence/atlas-202610/ATLAS.json"] = process.argv.slice(2);
const SIZES = [1000, 5000, 25000];
const FEES = [8, 10, 20];
const CEILINGS = [30, 50];
type Raw = { data: { asks: [string, string][]; bids: [string, string][]; ts: string } };
interface Book { symbol: string; status: number; body?: Raw; offset_s?: number; error?: string }
interface Round { round: number; started_utc: string; eligible: string[]; states: { body?: { data: unknown } }; calendar: { body?: { data: unknown } }; books: Book[]; flip: { books: Book[] } }

/** Pre-fee cost of the full order and of the best level, bps vs mid; sells are sized to the same notional at mid. */
function costs(raw: Raw, side: "buy" | "sell", notional: number) {
  const v = validateBook(raw as never);
  if (!v.valid) return null;
  if (side === "buy") {
    const leg = buyWithBudget(raw as never, String(notional), v.mid);
    return { full: leg.status === "OK" ? D(leg.bpsPreFeeExact!) : null, top: v.bestAsk.minus(v.mid).div(v.mid).mul(10000) };
  }
  const qty = D(notional).div(v.mid).toDecimalPlaces(4, 1).toString();
  const leg = sellShares(raw as never, qty, v.mid);
  return { full: leg.status === "OK" ? D(leg.bpsPreFeeExact!) : null, top: v.mid.minus(v.bestBid).div(v.mid).mul(10000) };
}

const files = readdirSync(dir).filter((f) => f.endsWith(".json.gz")).sort();
const cells = new Map<string, { snapshots: number; insufficient: number; overAtSize: number; topYesSizeNo: number; feeFlip10to20: number }>();
const flips = new Map<string, { pairs: number; changed: number }>();
const rounds: { round: number; started_utc: string; session: string; books: number; failed: number; metadataFailed: boolean }[] = [];
const bump = <T extends object>(m: Map<string, T>, k: string, init: T) => m.get(k) ?? (m.set(k, init), m.get(k)!);

for (const f of files) {
  const r = JSON.parse(gunzipSync(readFileSync(join(dir, f))).toString()) as Round;
  const states = r.states.body?.data as never, calendar = r.calendar.body?.data as never;
  const session = classifySession(new Date(r.started_utc), states ? { stateList: (states as { stateList?: unknown }).stateList ?? states } as never : null, calendar).state;
  const ok = r.books.filter((b) => b.status === 200 && b.body);
  // A round whose Bitget metadata could not be read has no universe; it is an outage, not a liquidity observation.
  const metadataFailed = !r.eligible.length;
  rounds.push({ round: r.round, started_utc: r.started_utc, session: metadataFailed ? "metadata_outage" : session, books: r.books.length, failed: r.books.length - ok.length, metadataFailed });
  if (metadataFailed) continue;
  for (const b of ok) for (const side of ["buy", "sell"] as const) for (const size of SIZES) {
    const c = costs(b.body!, side, size);
    if (!c) continue;
    for (const ceil of CEILINGS) {
      const cell = bump(cells, `${session}|${side}|${size}|${ceil}`, { snapshots: 0, insufficient: 0, overAtSize: 0, topYesSizeNo: 0, feeFlip10to20: 0 });
      cell.snapshots++;
      if (!c.full) { cell.insufficient++; continue; }
      if (c.full.plus(20).gt(ceil)) cell.overAtSize++;
      if (c.top.plus(20).lte(ceil) && c.full.plus(20).gt(ceil)) cell.topYesSizeNo++;
      if (c.full.plus(10).lte(ceil) && c.full.plus(20).gt(ceil)) cell.feeFlip10to20++;
    }
  }
  // Verdict change between a name's first capture and its re-capture at +5/+15/+30 s, at 5,000 USDT, each fee, 50 bps.
  const first = new Map(ok.map((b) => [b.symbol, b.body!]));
  for (const b of r.flip.books.filter((x) => x.status === 200 && x.body)) {
    const a = first.get(b.symbol);
    if (!a) continue;
    for (const side of ["buy", "sell"] as const) for (const fee of FEES) {
      const c0 = costs(a, side, 5000), c1 = costs(b.body!, side, 5000);
      if (!c0?.full || !c1?.full) continue;
      const k = bump(flips, `${session}|${side}|+${b.offset_s}s|fee${fee}`, { pairs: 0, changed: 0 });
      k.pairs++;
      if (c0.full.plus(fee).lte(50) !== c1.full.plus(fee).lte(50)) k.changed++;
    }
  }
}

const result = {
  schedule: "evidence/atlas-202610/SCHEDULE.md", rounds: rounds.filter((r) => !r.metadataFailed).length, attemptedRounds: rounds.length, metadataOutageRounds: rounds.filter((r) => r.metadataFailed).length,
  first: rounds[0]?.started_utc, last: rounds.at(-1)?.started_utc,
  bySession: Object.fromEntries([...new Set(rounds.filter((r) => !r.metadataFailed).map((r) => r.session))].map((s) => [s, rounds.filter((r) => r.session === s).length])),
  failedBooks: rounds.reduce((t, r) => t + r.failed, 0), totalBooks: rounds.reduce((t, r) => t + r.books, 0),
  cells: Object.fromEntries([...cells].map(([k, v]) => [k, v])),
  flips: Object.fromEntries([...flips].map(([k, v]) => [k, v])),
  roundsDetail: rounds,
};
writeFileSync(out, JSON.stringify(result, null, 1));
console.log(JSON.stringify({ rounds: result.rounds, bySession: result.bySession, failedBooks: result.failedBooks, totalBooks: result.totalBooks }));
