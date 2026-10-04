import type { Metadata } from "next";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { sound, ENGINE_VERSION } from "@/engine";
import { lastLook } from "@/engine/lastlook";
import { decidingRow } from "@/engine/decision";
import type { BookCapture, SoundingResult } from "@/engine/types";
import { recordedCapture, universe } from "@/lib/data";
import { LEAD_TEXT } from "@/lib/deletion";

export const metadata: Metadata = {
  title: "Sounding · Proof",
  description: "Recomputed at build, published runs left unchanged, and what Sounding does not check. Readable without JavaScript.",
};

type State = "recomputed" | "published" | "unchecked";
const STATE: Record<State, { label: string; cls: string }> = {
  recomputed: { label: "recomputed at build", cls: "bg-within-bg text-within" },
  published: { label: "published run, unchanged", cls: "bg-paper-3 text-ink-2" },
  unchecked: { label: "not checked", cls: "bg-warn-bg text-warn" },
};

interface EvalSummary { summary: { regex: { all: Tally }; qwen: { all: Tally } } }
interface Tally { statedCorrect: number; statedFields: number; wrong: number; held: number }
const evalFile = (p: string) => (JSON.parse(readFileSync(join(process.cwd(), "evidence", p), "utf8")) as EvalSummary).summary;
const iso = (ts: string) => `${new Date(Number(ts)).toISOString().replace("T", " ").slice(0, 19)}Z`;
const gap = (s: string) => (Number(s) < 3600 ? `${s} s` : `${(Number(s) / 86_400).toFixed(1)} days`);

function Tag({ s }: { s: State }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 mono text-[10px] uppercase tracking-[0.1em] ${STATE[s].cls}`}>{STATE[s].label}</span>;
}

function Block({ title, state, children }: { title: string; state: State; children: React.ReactNode }) {
  return (
    <section className="reveal-view border-t border-rule-soft py-16">
      <div className="flex flex-wrap items-center gap-3"><h2 className="display text-[36px] leading-tight text-ink sm:text-[44px]">{title}</h2><Tag s={state} /></div>
      <div className="mt-8">{children}</div>
    </section>
  );
}

/** Static at build from frozen fixtures and stored evaluation runs. */
export default async function Proof() {
  const u = await universe("recorded");
  const at = (key: string, userFeeBps: number): SoundingResult => {
    const capture = recordedCapture(key) as BookCapture;
    return sound({ intent: { side: "sell", baseQty: "178.4121" }, ceilingBps: 50, capture, userFeeBps, now: new Date(Number(capture.exchange_ts)), historical: true, stockInfo: u.stockInfo, states: u.states, calendar: u.calendar, instruments: u.instruments });
  };
  const yours = at("RHIMSUSDT", 8);
  const d = decidingRow(yours)!;
  const leg = yours.leg!;
  const capture = recordedCapture("RHIMSUSDT")!;
  const walked = capture.raw.data.bids.slice(0, leg.levelsConsumed).reduce<{ left: number; rows: { p: string; q: string; take: string }[] }>(
    (acc, [p, q]) => { const take = Math.min(acc.left, Number(q)); return { left: acc.left - take, rows: [...acc.rows, { p, q: String(Number(q)), take: take.toFixed(4) }] }; },
    { left: Number(leg.qty), rows: [] },
  ).rows;
  const looks = [
    { label: "Two real captures 21 seconds apart, Oct 3", r: lastLook(at("RHIMSUSDT@20261003a", 8), at("RHIMSUSDT@20261003b", 8)) },
    { label: "The Sep 20 decision re-checked on the Oct 3 book", r: lastLook(yours, at("RHIMSUSDT@20261003b", 8)) },
  ];
  type WholeSummary = Record<"model" | "template", { tasks: number; complete: number; safeAbstain: number; critical: number }>;
  const wholeFile = (p: string) => (JSON.parse(readFileSync(join(process.cwd(), "evidence/wholetask-eval-heldout", p), "utf8")) as { summary: WholeSummary }).summary;
  const whole = wholeFile("results.json");
  const wholeDev = wholeFile("dev-rerun-8ff1a3e/results.json");
  const runs = [
    { name: "Blind set 1, before fixes", note: "40 messages, today = 2026-10-03; published with its five wrong deadlines", s: evalFile("paraphrase-eval-20261003/results.json") },
    { name: "Blind set 2, held out", note: "40 new messages by a second writer, today = 2026-10-07; run once at commit bcf771a", s: evalFile("paraphrase-eval-v2-heldout/results.json"), lead: true },
    { name: "Set 2 again, after fixes", note: "development run at b29fc63: not a held-out number", s: evalFile("paraphrase-eval-v2-heldout/dev-rerun-b29fc63/results.json") },
  ];

  return (
    <>
      <Nav />
      <main id="main" className="mx-auto max-w-6xl px-4 sm:px-6">
        <section className="pt-16 pb-12 sm:pt-24">
          <h1 className="display max-w-4xl text-[48px] leading-[0.98] text-ink sm:text-[72px] lg:text-[84px]">Run it again yourself.</h1>
          <p className="mt-6 max-w-2xl text-[17px] leading-relaxed text-ink-2">Every block says what kind of proof it is. Engine results are recomputed when this page is built, from the same frozen Bitget books the desk replays. Evaluation runs are published as they came out, including the misses. What Sounding cannot check is listed, not hidden.</p>
          <div className="mt-6 flex flex-wrap gap-2"><Tag s="recomputed" /><Tag s="published" /><Tag s="unchecked" /></div>
        </section>

        <Block title="The order the desk opens on" state="recomputed">
          <blockquote className="max-w-3xl border-l-2 border-sea pl-4 text-[16px] leading-relaxed text-ink">&ldquo;{LEAD_TEXT}&rdquo;</blockquote>
          <p className="display mt-8 text-[30px] leading-tight text-ink sm:text-[36px]">{d.allInBps} bps all-in at your {d.feeBps} bps fee: <span className="text-within">within</span> your {yours.ceilingBps} bps ceiling.</p>
          {yours.worstCase && <p className="mt-3 text-[16px] text-ink-2">On the same book at the worst-case {yours.worstCase.feeBps} bps fee: {yours.worstCase.allInBps} bps, <span className="text-over">over</span>; the largest size that fits there is {yours.worstCase.clipQty} shares.</p>}
          <p className="mt-3 text-[14px] text-ink-3">Recorded Sunday rHIMS book, {iso(capture.exchange_ts)}. Pre-fee {leg.bpsPreFee} bps against the {yours.referenceMid} mid; proceeds {leg.cash} USDT at a VWAP of {leg.vwap}.</p>
          <div className="mt-8 grid gap-8 md:grid-cols-2">
            <table className="mono w-full text-[12px]">
              <caption className="eyebrow mb-3 text-left">the walk</caption>
              <thead><tr className="text-left text-ink-3"><th className="pb-2 font-normal">bid</th><th className="pb-2 font-normal">shown</th><th className="pb-2 font-normal">taken</th></tr></thead>
              <tbody>{walked.map((l, i) => <tr key={i} className="border-t border-rule-soft"><td className="py-1.5">{l.p}</td><td>{l.q}</td><td>{l.take}</td></tr>)}</tbody>
            </table>
            <table className="mono w-full text-[12px]">
              <caption className="eyebrow mb-3 text-left">every fee</caption>
              <thead><tr className="text-left text-ink-3"><th className="pb-2 font-normal">fee</th><th className="pb-2 font-normal">all-in</th><th className="pb-2 font-normal">vs 50 bps</th></tr></thead>
              <tbody>{yours.fees!.map((f) => <tr key={`${f.source}-${f.feeBps}`} className="border-t border-rule-soft"><td className="py-1.5">{f.feeBps} bps{f.source === "user" ? " · yours" : ""}</td><td>{f.allInBps}</td><td className={f.verdict === "WITHIN_CEILING_ON_THIS_SNAPSHOT" ? "text-within" : "text-over"}>{f.verdict === "WITHIN_CEILING_ON_THIS_SNAPSHOT" ? "✓ within" : "✕ over"}</td></tr>)}</tbody>
            </table>
          </div>
          <pre className="mono mt-8 overflow-x-auto rounded-xl bg-paper-2 p-4 text-[12px] text-ink-2">pnpm replay fixtures/rhims-20260920T090235Z.json sell 178.4121 50 8{"\n"}# receipt {yours.receipt.receipt_sha256} · {ENGINE_VERSION}</pre>
        </Block>

        <Block title="Last Look on real captures" state="recomputed">
          <ul className="grid gap-3 md:grid-cols-2">
            {looks.map(({ label, r }) => (
              <li key={label} className="rounded-[20px] border border-rule-soft p-5">
                <div className={`text-[16px] ${r.status === "STANDS_ON_FRESH_BOOK" ? "text-within" : "text-over"}`}>{r.status === "STANDS_ON_FRESH_BOOK" ? "✓ Stands" : "✕ Void"} <span className="text-ink-3">· {label}</span></div>
                <p className="mono mt-2 text-[12px] text-ink-3">gap {gap(r.gapSeconds)} · cost drift {r.driftBps ?? "—"} bps · price drift {r.priceDriftBps ?? "—"} bps</p>
                <ul className="mt-3 space-y-1 text-[14px] text-ink-2">{r.reasons.map((x, i) => <li key={i}>{x.charAt(0).toUpperCase() + x.slice(1)}.</li>)}</ul>
              </li>
            ))}
          </ul>
        </Block>

        <Block title="Reading the trader's words" state="published">
          <p className="max-w-3xl text-[15px] leading-relaxed text-ink-2">Messages in English, 中文 and mixed, with gold values, written by agents told not to read the code. A field counts only if the right value reached the engine. &ldquo;Wrong&rdquo; is the dangerous outcome: a different value used without asking.</p>
          <div className="mt-8 overflow-x-auto">
            <table className="w-full min-w-[640px] text-[14px]">
              <thead><tr className="text-left text-[12px] text-ink-3"><th className="pb-3 font-normal">run</th><th className="pb-3 font-normal">Qwen, checked</th><th className="pb-3 font-normal">wrong</th><th className="pb-3 font-normal">asked back</th><th className="pb-3 font-normal">regex reader</th></tr></thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.name} className={`border-t border-rule-soft align-top ${r.lead ? "text-ink" : "text-ink-2"}`}>
                    <td className="py-3 pr-4"><div>{r.name}</div><div className="text-[12px] text-ink-3">{r.note}</div></td>
                    <td className="mono py-3">{r.s.qwen.all.statedCorrect} / {r.s.qwen.all.statedFields}</td>
                    <td className={`mono py-3 ${r.s.qwen.all.wrong ? "text-over" : "text-within"}`}>{r.s.qwen.all.wrong}</td>
                    <td className="mono py-3">{r.s.qwen.all.held}</td>
                    <td className="mono py-3 text-ink-3">{r.s.regex.all.statedCorrect} / {r.s.regex.all.statedFields}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-[13px] text-ink-3">Prompts, gold values, every value each reader extracted, and the scoring script are in the repository under evidence/ and scripts/paraphrase-eval.ts.</p>
        </Block>

        <Block title="Whole tasks, end to end" state="published">
          <p className="max-w-3xl text-[15px] leading-relaxed text-ink-2">Thirty complete tasks written blind: starting controls, one to three chat turns in English, 中文 or both, and the right outcome. Some must be answered, some must be asked back, some name a stock with no book. Every turn runs through the real route. Critical means the wrong order was priced, a route broke the trader&rsquo;s ceiling or deadline, or it acted where it had to ask.</p>
          <div className="mt-8 overflow-x-auto">
            <table className="w-full min-w-[560px] text-[14px]">
              <thead><tr className="text-left text-[12px] text-ink-3"><th className="pb-3 font-normal">run</th><th className="pb-3 font-normal">complete</th><th className="pb-3 font-normal">asked when it could answer</th><th className="pb-3 font-normal">critical</th></tr></thead>
              <tbody>
                {[{ name: "Qwen, checked · held-out, once", s: whole.model, lead: true }, { name: "Regex reader and template, no model · held-out", s: whole.template }, { name: "Qwen, checked · same set after fixes (development)", s: wholeDev.model }].map((r) => (
                  <tr key={r.name} className={`border-t border-rule-soft ${r.lead ? "text-ink" : "text-ink-2"}`}>
                    <td className="py-3 pr-4">{r.name}</td>
                    <td className="mono">{r.s.complete} / {r.s.tasks}</td>
                    <td className="mono">{r.s.safeAbstain}</td>
                    <td className={`mono ${r.s.critical ? "text-over" : "text-within"}`}>{r.s.critical}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-[13px] text-ink-3">Held-out run, once, at commit 78e5291. Its three critical errors (two instruments in one message, two fees in one sentence) are published with it in evidence/wholetask-eval-heldout, and were fixed afterwards; a re-run on the same set after that is a development number, not this one.</p>
        </Block>

        <Block title="The book is Bitget's book" state="published">
          <p className="max-w-3xl text-[15px] leading-relaxed text-ink-2">On 2026-09-20 at 09:25:59 UTC, the top five bids and asks for rHOOD on Bitget&rsquo;s web order book were compared with the public API capture taken the same second: 10 of 10 levels matched in price and size. One instrument, one instant. Bitget&rsquo;s separately documented Reality depth feed was not compared.</p>
        </Block>

        <Block title="What Sounding does not check" state="unchecked">
          <ul className="grid gap-3 text-[15px] text-ink-2 md:grid-cols-2">
            {[
              "Whether an order would be accepted or filled. Nothing is sent, and no order type is tested live.",
              "Hidden or off-book liquidity, and how market makers behave at the session switch.",
              "The future book. Every answer is conditional on the snapshot it names.",
              "Bitget's whitelisted Reality depth feed, which may differ from the public book.",
              "How current a recorded universe is: recorded pages say the capture date.",
              "Fee tiers. Your fee is whatever you state; unknown fees fall to the worst scenario.",
            ].map((x) => <li key={x} className="flex gap-3 rounded-2xl border border-rule-soft p-4"><span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-warn" />{x}</li>)}
          </ul>
        </Block>
      </main>
      <Footer />
    </>
  );
}
