import type { Metadata } from "next";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { atlas, census, CENSUS_FEE_BPS, CENSUS_LIST_FEE_BPS } from "@/lib/research";

export const metadata: Metadata = {
  title: "Sounding · Research",
  description: "What walking every weekend-tradable Bitget book at real sizes shows: the best quote misleads at size, on Bitget's published fee.",
};

const SESSION: Record<string, string> = { weekend_mm: "weekend", holiday_mm: "holiday", overnight: "overnight", pre_market: "pre-market", regular: "regular", after_hours: "after-hours", unknown: "unclassified" };
const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "—");

/** Static at build: the census is recomputed by the engine; the atlas shows its latest committed analysis. */
export default function Research() {
  const c = census();
  const lead = c.cells.find((x) => x.budget === 5000 && x.ceiling === 50)!;
  const fee = CENSUS_FEE_BPS, list = CENSUS_LIST_FEE_BPS;
  const big = c.cells.find((x) => x.budget === 25000 && x.ceiling === 50)!;
  const a = atlas();
  const sessions = a ? Object.keys(a.bySession) : [];
  return (
    <>
      <Nav />
      <main id="main" className="mx-auto max-w-6xl px-4 sm:px-6">
        <section className="pt-16 pb-14 sm:pt-24">
          <h1 className="display max-w-4xl text-[48px] leading-[0.98] text-ink sm:text-[72px] lg:text-[84px]">The best quote says yes. Your size says no.</h1>
          <p className="mt-6 max-w-2xl text-[17px] leading-relaxed text-ink-2">Every weekend-tradable rToken on Bitget, {c.names} of them, walked at real order sizes with Sounding&rsquo;s own engine, at Bitget&rsquo;s published {fee} bps rToken taker fee. What a quote cannot show: what your size actually costs.</p>
        </section>

        <section className="grid gap-px overflow-hidden rounded-[22px] border border-rule-soft bg-rule-soft md:grid-cols-3">
          {[
            { n: lead.topYesSizeNo, d: lead.priced, line: `names where the best ask is inside a 50 bps ceiling but a 5,000 USDT buy is not, at a ${fee} bps fee` },
            { n: big.topYesSizeNo, d: big.priced, line: `the same at 25,000 USDT${big.insufficient ? `; ${big.insufficient} more book is too thin to fill it at all` : ""}` },
            { n: big.feeFlip, d: big.priced, line: `25,000 USDT buys within 50 bps at the published ${fee} bps but over at the ${list} bps list rate: where knowing your own fee changes the answer` },
          ].map((x) => (
            <div key={x.line} className="reveal-view bg-paper p-6 sm:p-8">
              <div className="flex items-baseline gap-3"><span className="display text-[64px] leading-none text-ink num">{x.n}</span><span className="mono text-[13px] text-ink-3">/ {x.d}</span></div>
              <p className="mt-3 text-[15px] leading-relaxed text-ink-2">{x.line}.</p>
            </div>
          ))}
        </section>
        <p className="mt-4 text-[13px] text-ink-3">One recorded snapshot, {c.captured_utc.replace("T", " ").slice(0, 16)} UTC, a Sunday weekend session; recomputed when this page was built. Median all-in for a 5,000 USDT buy at {fee} bps: {c.lead.median ? `${c.lead.median} bps` : "—"}. The {c.lead.inversions.length} at 5,000 USDT: {c.lead.inversions.map((s) => `r${s}`).join(", ")}.</p>
        <div className="mt-6 max-w-3xl rounded-2xl border border-warn/40 bg-warn-bg/40 p-5 text-[14px] leading-relaxed text-ink-2">
          <div className="eyebrow mb-2 text-warn">Correction, 2026-10-07</div>
          This page first published these counts at an assumed 20 bps fee added on top of the walk: 57 of 89 names at 25,000 USDT, 6 of 90 at 5,000 USDT, 31 of 90 that flipped between 10 and 20 bps, and a 38.60 bps median. An independent review found that Bitget publishes a {fee} bps rToken taker fee (VIP 0-4, under a promotion extended on 2026-09-01; higher tiers and BGB deduction pay less), and that the fee is charged on the traded amount. Recomputed on the same frozen books: 28 of 89, 6 of 90 (only three of the same names), and a 23.61 bps median. The finding that the best quote misleads at size holds; its size at 25,000 USDT is about half what was first shown.
        </div>

        <section className="border-t border-rule-soft py-20 mt-16">
          <h2 className="display max-w-3xl text-[40px] leading-[1.05] text-ink sm:text-[52px]">Every size, every ceiling.</h2>
          <div className="mt-10 overflow-x-auto">
            <table className="w-full min-w-[640px] text-[14px]">
              <thead><tr className="text-left text-[12px] text-ink-3"><th className="pb-3 font-normal">buy budget</th><th className="pb-3 font-normal">ceiling</th><th className="pb-3 font-normal">over at full size, {fee} bps fee</th><th className="pb-3 font-normal">best ask yes, full size no</th><th className="pb-3 font-normal">within at {fee} bps, over at the {list} bps list rate</th><th className="pb-3 font-normal">too thin to fill</th></tr></thead>
              <tbody>
                {c.cells.map((x) => (
                  <tr key={`${x.budget}-${x.ceiling}`} className="border-t border-rule-soft">
                    <td className="mono py-3">{x.budget.toLocaleString("en-US")} USDT</td>
                    <td className="mono">{x.ceiling} bps</td>
                    <td className="mono">{x.overAtSize} / {x.priced}</td>
                    <td className="mono text-ink">{x.topYesSizeNo} / {x.priced}</td>
                    <td className="mono text-ink">{x.feeFlip} / {x.priced}</td>
                    <td className="mono">{x.insufficient}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 max-w-3xl text-[13px] text-ink-3">Cost against each book&rsquo;s displayed mid, with the taker fee charged on the traded amount. Books too thin to fill the order are counted in their own column and left out of the other denominators. An independent reviewer recomputed every cell at {fee} bps with its own script, adding the fee on top, and found the same counts; charging the fee on the traded amount changes none of them on these books.</p>
        </section>

        <section className="border-t border-rule-soft py-20">
          <h2 className="display max-w-3xl text-[40px] leading-[1.05] text-ink sm:text-[52px]">Is one snapshot typical? Measured every 30 minutes.</h2>
          <p className="mt-5 max-w-2xl text-[16px] leading-relaxed text-ink-2">The schedule was written before the first capture: every eligible book, raw, every half hour until 2026-10-08, across weekend, overnight and US sessions, with a dozen names re-read 5, 15 and 30 seconds later to see how fast an answer goes stale. Failures stay in the record.</p>
          {a ? (
            <>
              <p className="mt-6 text-[14px] text-ink-3">{a.rounds} rounds analysed{a.metadataOutageRounds ? ` (plus ${a.metadataOutageRounds} of ${a.attemptedRounds} attempted where Bitget's metadata could not be read; kept in the record, left out of every rate)` : ""}, {a.first?.slice(0, 16).replace("T", " ")} to {a.last?.slice(0, 16).replace("T", " ")} UTC · {a.totalBooks - a.failedBooks} of {a.totalBooks} books read · sessions: {sessions.map((s) => `${SESSION[s] ?? s} ${a.bySession[s]}`).join(", ")}</p>
              <div className="mt-8 overflow-x-auto">
                <table className="w-full min-w-[640px] text-[14px]">
                  <thead><tr className="text-left text-[12px] text-ink-3"><th className="pb-3 font-normal">session</th><th className="pb-3 font-normal">best ask yes, full size no · 5,000 USDT buy, 50 bps</th><th className="pb-3 font-normal">same · 25,000 USDT</th><th className="pb-3 font-normal">answer changed 30 s later · 5,000 USDT, {a.fees.decides} bps fee</th></tr></thead>
                  <tbody>
                    {sessions.map((s) => {
                      const k5 = a.cells[`${s}|buy|5000|50`], k25 = a.cells[`${s}|buy|25000|50`];
                      const f = Object.entries(a.flips).filter(([k]) => k.startsWith(`${s}|`) && k.includes(`|+30s|fee${a.fees.decides}`)).reduce((t, [, v]) => ({ pairs: t.pairs + v.pairs, changed: t.changed + v.changed, gone: t.gone + v.toUnpriced }), { pairs: 0, changed: 0, gone: 0 });
                      return (
                        <tr key={s} className="border-t border-rule-soft">
                          <td className="py-3">{SESSION[s] ?? s}</td>
                          <td className="mono">{k5 ? `${k5.topYesSizeNo} / ${k5.snapshots} (${pct(k5.topYesSizeNo, k5.snapshots)})` : "—"}</td>
                          <td className="mono">{k25 ? `${k25.topYesSizeNo} / ${k25.snapshots} (${pct(k25.topYesSizeNo, k25.snapshots)})` : "—"}</td>
                          <td className="mono">{f.pairs ? `${f.changed} / ${f.pairs}${f.gone ? ` (+${f.gone} no longer fillable)` : ""}` : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : <p className="mt-6 text-[14px] text-ink-3">The first analysis has not been published yet.</p>}
          <p className="mt-6 max-w-3xl text-[13px] text-ink-3">What this cannot show: fills, hidden or off-book liquidity, hours that were not sampled, or that one week is typical. A missed round stays missing.</p>
          <pre className="mono mt-6 overflow-x-auto rounded-xl bg-paper-2 p-4 text-[12px] text-ink-2">pnpm exec tsx scripts/census-inversions.ts evidence/census-20260920/eligible-census-RAW-20260920T0902Z.json 5000 {fee} 50{"\n"}pnpm exec tsx scripts/atlas-analyze.ts</pre>
        </section>
      </main>
      <Footer />
    </>
  );
}
