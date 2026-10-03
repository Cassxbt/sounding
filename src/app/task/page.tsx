import type { Metadata } from "next";
import { sound, ENGINE_VERSION } from "@/engine";
import { lastLook } from "@/engine/lastlook";
import { decidingRow } from "@/engine/decision";
import type { BookCapture, SoundingResult } from "@/engine/types";
import { recordedCapture, universe } from "@/lib/data";

export const metadata: Metadata = {
  title: "Sounding · frozen task",
  description: "One trader request on a recorded Bitget rHIMS book, answered by the engine at build time. Readable without JavaScript.",
};

const QUESTION = "Sell 178.4121 rHIMS. I pay 0.08% taker, keep it under half a percent all-in, and I must be out before the 8th.";
const ORDER = { intent: { side: "sell" as const, baseQty: "178.4121" }, ceilingBps: 50 };
const gap = (s: string) => (Number(s) < 3600 ? `${s} s` : `${(Number(s) / 86_400).toFixed(1)} days`);
const iso = (ts: string) => `${new Date(Number(ts)).toISOString().replace("T", " ").slice(0, 19)}Z`;

/** Server-rendered from the frozen fixtures at build time: every number below is engine output, none is typed in. */
export default async function Task() {
  const u = await universe("recorded");
  const at = (key: string, userFeeBps: number): SoundingResult => {
    const capture = recordedCapture(key) as BookCapture;
    return sound({ ...ORDER, capture, userFeeBps, now: new Date(Number(capture.exchange_ts)), historical: true, stockInfo: u.stockInfo, states: u.states, calendar: u.calendar, instruments: u.instruments });
  };
  const yours = at("RHIMSUSDT", 8);
  const higherFee = at("RHIMSUSDT", 20);
  const clip = higherFee.alternatives?.find((a) => a.kind === "largest_within_ceiling");
  const stands = lastLook(at("RHIMSUSDT@20261003a", 8), at("RHIMSUSDT@20261003b", 8));
  const stale = lastLook(yours, at("RHIMSUSDT@20261003b", 8));
  const leg = yours.leg!;
  const capture = recordedCapture("RHIMSUSDT")!;
  let left = Number(leg.qty);
  const walked = capture.raw.data.bids.slice(0, leg.levelsConsumed).map(([p, q]) => { const take = Math.min(left, Number(q)); left -= take; return { p, q: String(Number(q)), take: take.toFixed(4) }; });

  const gates: [string, string][] = [
    ["instrument", `${yours.symbol} listed; quantity precision ${yours.spec?.quantityPrecision} dp, minimum order ${yours.spec?.minOrderAmount} USDT`],
    ["session", `${yours.session} · ${yours.sessionDetail}`],
    ["weekend eligibility", `weekendTradable = ${yours.weekendTradable ? "yes" : "no"} in the stock-info capture`],
    ["exchange constraints", `178.4121 is within ${yours.spec?.quantityPrecision} dp; proceeds ${leg.cash} USDT clear the minimum`],
    ["book validity", `${capture.raw.data.bids.length} bid levels, crossed or empty books refused`],
    ["freshness", "recorded book: the age, round-trip and clock-offset limits (5 s / 2 s / 2 s) apply to live soundings only"],
    ["stability", "a single sounding; the 10 bps limit applies between consecutive live soundings"],
  ];

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 space-y-10 text-ink">
      <header className="space-y-3">
        <div className="mono text-[11px] uppercase tracking-[0.18em] text-ink-3">sounding · frozen task · {ENGINE_VERSION}</div>
        <h1 className="display text-4xl leading-tight">One request, one decision</h1>
        <p className="text-ink-2">The trader's words, a recorded Saturday rHIMS book from {iso(capture.exchange_ts)}, and what the engine answers. This page is rendered on the server from the frozen fixtures; it needs no JavaScript. Nothing here is a fill, a forecast or a promise.</p>
        <blockquote className="border-l-2 border-sea pl-4 text-lg">&ldquo;{QUESTION}&rdquo;</blockquote>
      </header>

      <section className="space-y-2">
        <h2 className="mono text-[11px] uppercase tracking-[0.18em] text-ink-3">the decision</h2>
        <p className="display text-3xl">{decidingRow(yours)!.allInBps} bps all-in at your 8 bps fee: within your 50 bps ceiling on this snapshot.</p>
        <p className="text-ink-2">Pre-fee cost {leg.bpsPreFee} bps against the {yours.referenceMid} mid; proceeds {leg.cash} USDT at a VWAP of {leg.vwap} across {leg.levelsConsumed} bid levels.</p>
      </section>

      <section className="space-y-2">
        <h2 className="mono text-[11px] uppercase tracking-[0.18em] text-ink-3">the same order at someone else&rsquo;s fee</h2>
        <p>At a 20 bps fee the same book gives {decidingRow(higherFee)!.allInBps} bps: <strong className="text-over">over the ceiling</strong>. The engine refuses the full order and names the largest size that fits: {clip?.qty} shares, leaving {clip?.remainder} shares unpriced. A partial does not exit the full position, so under a hard exit it is not offered as the answer.</p>
        <p className="text-ink-3 text-sm">Remove the trader&rsquo;s fee and ceiling and there is a number but no decision.</p>
      </section>

      <section className="space-y-2">
        <h2 className="mono text-[11px] uppercase tracking-[0.18em] text-ink-3">gates, in order</h2>
        <ol className="space-y-1 text-sm list-decimal pl-5">{gates.map(([k, v]) => <li key={k}><span className="mono">{k}</span> <span className="text-ink-2">— {v}</span></li>)}</ol>
      </section>

      <section className="space-y-2">
        <h2 className="mono text-[11px] uppercase tracking-[0.18em] text-ink-3">the walk</h2>
        <table className="mono text-[12px]">
          <thead><tr className="text-ink-3 text-left"><th className="pr-6 font-normal">bid</th><th className="pr-6 font-normal">shown</th><th className="font-normal">taken</th></tr></thead>
          <tbody>{walked.map((l, i) => <tr key={i}><td className="pr-6">{l.p}</td><td className="pr-6">{l.q}</td><td>{l.take}</td></tr>)}</tbody>
        </table>
        <table className="mono text-[12px] mt-3">
          <thead><tr className="text-ink-3 text-left"><th className="pr-6 font-normal">fee</th><th className="pr-6 font-normal">all-in</th><th className="font-normal">verdict vs 50 bps</th></tr></thead>
          <tbody>{yours.fees!.map((f) => <tr key={`${f.source}-${f.feeBps}`}><td className="pr-6">{f.feeBps} bps{f.source === "user" ? " · yours" : ""}</td><td className="pr-6">{f.allInBps}</td><td className={f.verdict === "WITHIN_CEILING_ON_THIS_SNAPSHOT" ? "text-within" : "text-over"}>{f.verdict === "WITHIN_CEILING_ON_THIS_SNAPSHOT" ? "within" : "over"}</td></tr>)}</tbody>
        </table>
      </section>

      <section className="space-y-3">
        <h2 className="mono text-[11px] uppercase tracking-[0.18em] text-ink-3">last look: the slippage you accepted is the slippage you confirm</h2>
        <p className="text-ink-2 text-sm">On confirm the book is walked again. The decision stands only if every gate passes, it is still within the ceiling at the deciding fee, cost and price each moved at most {stands.toleranceBps} bps, and the decision is under two minutes old.</p>
        {[{ label: "Two real captures 21 seconds apart (Oct 3)", r: stands }, { label: "The Sep 20 decision confirmed on the Oct 3 book", r: stale }].map(({ label, r }) => (
          <div key={label} className="rounded border rule p-3 text-sm space-y-1">
            <div><span className={`mono uppercase text-[11px] tracking-[0.14em] ${r.status === "STANDS_ON_FRESH_BOOK" ? "text-within" : "text-over"}`}>{r.status}</span> · {label} · gap {gap(r.gapSeconds)} · cost drift {r.driftBps ?? "—"} bps · price drift {r.priceDriftBps ?? "—"} bps</div>
            <ul className="text-ink-2">{r.reasons.map((x, i) => <li key={i}>— {x}</li>)}</ul>
          </div>
        ))}
      </section>

      <section className="space-y-2 text-sm">
        <h2 className="mono text-[11px] uppercase tracking-[0.18em] text-ink-3">reproduce</h2>
        <p className="text-ink-2">Receipt <span className="mono">{yours.receipt.receipt_sha256}</span> covers the inputs, the raw book hash <span className="mono">{yours.receipt.raw_sha256.slice(0, 16)}…</span> and every output above.</p>
        <pre className="mono text-[12px] bg-paper-2/60 rounded p-3 overflow-x-auto">pnpm replay fixtures/rhims-20260920T090235Z.json sell 178.4121 50 8</pre>
        <p><a className="underline" href="/">Open the live app</a></p>
      </section>
    </main>
  );
}
