"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowDown, ArrowRight, CaretDown, Clock, DownloadSimple, Hourglass, Lightning, Play, Scissors, Sliders } from "@phosphor-icons/react";
import { Nav } from "@/components/Nav";
import { DecisionCard } from "@/components/DecisionCard";
import { SoundingLine } from "@/components/SoundingLine";
import { AnalystPanel } from "@/components/AnalystPanel";
import { LastLookPanel } from "@/components/LastLookPanel";
import { DeletionRows } from "@/components/DeletionRows";
import { Footer } from "@/components/Footer";
import type { DeletionRow } from "@/lib/deletion";
import { Proof } from "@/components/Proof";
import { Reveal } from "@/components/ui/Reveal";
import { decidingRow } from "@/engine/decision";
import type { Alternative, SoundingResult } from "@/engine/types";

type Mode = "recorded" | "live";
interface Universe { source: string; fetched_utc: string; total: number; eligibleCount: number; eligible: { symbol: string; code: string; name: string }[]; session: { state: string; detail: string; ny: { tzName: string; weekday: string; date: string } }; now_utc: string }
interface Resp { result: SoundingResult; levels: { asks: [string, string][]; bids: [string, string][] }; universe?: { source: string; fetched_utc: string }; capture: Record<string, unknown>; fixtureFile?: string }
interface Preset { id: string; label: string; outcome: string; tone: "within" | "over" | "warn"; symbol: string; side: "buy" | "sell"; amount: string; ceiling: number; userFee?: number; fixture?: string; confirmFixture?: string; confirmNote?: string }

const PRESETS: Preset[] = [
  { id: "lead", label: "Sell 178.4121 rHIMS, fee not yet said", outcome: "over at worst case", tone: "over", symbol: "RHIMSUSDT", side: "sell", amount: "178.4121", ceiling: 50 },
  { id: "fee-8", label: "The same order, 8 bps fee set by hand", outcome: "within", tone: "within", symbol: "RHIMSUSDT", side: "sell", amount: "178.4121", ceiling: 50, userFee: 8 },
  { id: "ll-stands", label: "Re-check on a book 21 s later", outcome: "stands", tone: "within", symbol: "RHIMSUSDT", side: "sell", amount: "178.4121", ceiling: 50, userFee: 8, fixture: "RHIMSUSDT@20261003a", confirmFixture: "RHIMSUSDT@20261003b", confirmNote: "Recorded demo: the re-check walks a real capture taken 21 s after the one you read. In live mode it walks the book at the moment you press it." },
  { id: "ll-void", label: "Re-check a decision 12.7 days old", outcome: "void", tone: "over", symbol: "RHIMSUSDT", side: "sell", amount: "178.4121", ceiling: 50, userFee: 8, fixture: "RHIMSUSDT", confirmFixture: "RHIMSUSDT@20261003b", confirmNote: "Recorded demo: the Sep 20 decision re-checked against a real capture taken 12.7 days later." },
  { id: "hims-precision", label: "Sell 178.412132 rHIMS (6 decimals)", outcome: "refused", tone: "over", symbol: "RHIMSUSDT", side: "sell", amount: "178.412132", ceiling: 50 },
  { id: "spy-1k", label: "Buy rSPY with 1,000 USDT", outcome: "thin top", tone: "warn", symbol: "RSPYUSDT", side: "buy", amount: "1000", ceiling: 20 },
  { id: "spmo-25k", label: "Buy rSPMO with 25,000 USDT", outcome: "book too thin", tone: "over", symbol: "RSPMOUSDT", side: "buy", amount: "25000", ceiling: 50 },
];

const ALT: Record<Alternative["kind"], { icon: typeof Lightning; title: string }> = {
  immediate_cross: { icon: Lightning, title: "Cross now, full size" },
  largest_within_ceiling: { icon: Scissors, title: "The largest size that fits" },
  resting_limit: { icon: Hourglass, title: "Rest a limit order" },
  requote_at_switch: { icon: Clock, title: "Re-sound at the next session" },
};

/** Engine tradeoff codes in the words a trader would use; anything unmapped keeps its own text. */
const plain = (t: string) => t
  .replace(/^no_fill_possible$/, "may not fill at all")
  .replace(/^cancel_at_session_switch/, "cancelled at the session switch")
  .replace(/^band eligibility unverified$/, "price-band eligibility not verified")
  .replace(/_/g, " ");


export default function Page() {
  const [mode, setMode] = useState<Mode>("recorded");
  const [uni, setUni] = useState<Universe | null>(null);
  const [symbol, setSymbol] = useState("RHIMSUSDT");
  const [side, setSide] = useState<"buy" | "sell">("sell");
  const [amount, setAmount] = useState("178.4121");
  const [ceiling, setCeiling] = useState(50);
  const [userFee, setUserFee] = useState<string>("");
  const [active, setActive] = useState("lead");
  const [resp, setResp] = useState<Resp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [prevBps, setPrevBps] = useState<string | undefined>();
  const [age, setAge] = useState(0);
  const [terms, setTerms] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const [fixture, setFixture] = useState<{ sound?: string; confirm?: string; confirmNote?: string }>({});
  const reduce = useReducedMotion();
  const [deletion, setDeletion] = useState<{ rows: DeletionRow[] } | null>(null);

  useEffect(() => { fetch("/api/deletion").then((r) => r.json()).then(setDeletion).catch(() => setDeletion(null)); }, []);
  useEffect(() => { fetch(`/api/universe?mode=${mode}`).then((r) => r.json()).then(setUni).catch(() => setUni(null)); }, [mode]);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("task");
    preset(PRESETS.find((x) => x.id === id) ?? PRESETS[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!resp || resp.result.freshness.historical) return;
    const t = setInterval(() => setAge(Date.now() - Number(resp.result.receipt.exchange_ts)), 500);
    return () => clearInterval(t);
  }, [resp]);

  const expired = !!resp && !resp.result.freshness.historical && age > 5000;

  // The mode is passed in by callers that change it; React state would still hold the old one here.
  // Only the latest request may land; an earlier, slower one is dropped.
  const latest = useRef(0);
  async function run(over?: Partial<{ symbol: string; side: "buy" | "sell"; amount: string; ceiling: number; fixture: string; userFee: string; mode: Mode }>) {
    const id = ++latest.current;
    setBusy(true); setErr(null);
    const m = over?.mode ?? mode;
    const fx = over?.fixture !== undefined ? over.fixture || undefined : fixture.sound;
    const fee = over?.userFee !== undefined ? over.userFee : userFee;
    const body = { symbol: over?.symbol ?? symbol, side: over?.side ?? side, amount: over?.amount ?? amount, ceilingBps: over?.ceiling ?? ceiling, userFeeBps: fee === "" ? undefined : Number(fee), mode: m, previousBpsPreFee: m === "live" ? prevBps : undefined, fixture: m === "recorded" ? fx : undefined };
    let r: Response, j;
    try {
      r = await fetch("/api/sound", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      j = await r.json();
    } catch {
      if (id === latest.current) { setBusy(false); setErr("Could not reach the engine. Try again."); }
      return;
    }
    if (id !== latest.current) return;
    setBusy(false);
    if (!r.ok) { setErr(j.error ?? "request failed"); setResp(null); return; }
    setResp(j); setAge(0);
    if (j.result?.leg?.bpsPreFee) setPrevBps(j.result.leg.bpsPreFee);
  }
  function preset(p: Preset) {
    const fx = p.fixture ? { sound: p.fixture, confirm: p.confirmFixture, confirmNote: p.confirmNote } : {};
    const fee = p.userFee !== undefined ? String(p.userFee) : "";
    setSymbol(p.symbol); setSide(p.side); setAmount(p.amount); setCeiling(p.ceiling); setMode("recorded"); setFixture(fx); setUserFee(fee); setActive(p.id); setEpoch((e) => e + 1);
    setTimeout(() => run({ symbol: p.symbol, side: p.side, amount: p.amount, ceiling: p.ceiling, fixture: fx.sound ?? "", userFee: fee, mode: "recorded" }), 0);
  }
  function switchMode(m: Mode) {
    setMode(m); setFixture({}); setActive(""); setEpoch((e) => e + 1);
    setTimeout(() => run({ fixture: "", mode: m }), 0);
  }

  const res = resp?.result;
  const code = uni?.eligible.find((s) => s.symbol === symbol)?.code ?? symbol.replace(/^R|USDT$/g, "");
  const d = res ? decidingRow(res) : undefined;
  // The command replays the exact recorded book this result was priced on.
  const replayCmd = useMemo(() => (res && resp?.fixtureFile ? `pnpm replay fixtures/${resp.fixtureFile} ${res.intent.side} ${res.intent.side === "sell" ? res.intent.baseQty : res.intent.quoteBudget} ${res.ceilingBps}${res.fees?.find((f) => f.source === "user") ? ` ${res.fees.find((f) => f.source === "user")!.feeBps}` : ""}` : ""), [res, resp]);
  const freshness = !res ? "" : res.freshness.historical ? `recorded · ${new Date(Number(res.receipt.exchange_ts)).toISOString().slice(0, 16).replace("T", " ")}Z` : expired ? "live · expired, re-sound" : `live · ${(age / 1000).toFixed(1)} s old`;

  const controls = (
    <>
      <Pill label="Side">
        <select aria-label="Side" value={side} onChange={(e) => { const s = e.target.value as "buy" | "sell"; setSide(s); setActive(""); setEpoch((e) => e + 1); run({ side: s }); }} className="appearance-none bg-transparent pr-5 focus:outline-none">
          <option value="sell">Sell</option><option value="buy">Buy</option>
        </select>
      </Pill>
      <Pill label="Instrument">
        <select aria-label="Instrument" value={symbol} onChange={(e) => { setSymbol(e.target.value); setFixture({}); setActive(""); setEpoch((x) => x + 1); run({ symbol: e.target.value, fixture: "" }); }} className="max-w-[9.5rem] appearance-none bg-transparent pr-5 focus:outline-none">
          {(uni?.eligible ?? [{ symbol, code, name: "" }]).map((s) => <option key={s.symbol} value={s.symbol}>r{s.code}</option>)}
        </select>
      </Pill>
      <button type="button" onClick={() => setTerms((t) => !t)} aria-expanded={terms} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] transition-colors duration-[var(--dur-micro)] ${terms ? "border-rule bg-paper-3 text-ink" : "border-rule-soft text-ink-3 hover:text-ink-2"}`}>
        <Sliders size={13} /> by hand
      </button>
      {terms && (
        <div className="grid w-full basis-full grid-cols-3 gap-2 px-1 pt-2">
          <Field label={side === "sell" ? "Shares" : "USDT"} value={amount} onChange={setAmount} />
          <Field label="Ceiling, bps" value={String(ceiling)} onChange={(v) => setCeiling(Number(v) || 0)} />
          <Field label="Your fee, bps" value={userFee} onChange={setUserFee} placeholder="unknown" />
          <button type="button" onClick={() => { setActive(""); setEpoch((e) => e + 1); run(); }} className="col-span-3 rounded-full border border-rule py-2 text-[13px] text-ink transition-colors duration-[var(--dur-micro)] hover:bg-paper-3">Sound these terms</button>
        </div>
      )}
    </>
  );

  return (
    <>
      <Nav mode={mode} onMode={switchMode} eligible={uni?.eligibleCount} total={uni?.total} source={uni ? (uni.source === "live" ? "live" : `recorded ${uni.fetched_utc.slice(0, 10)}`) : undefined} />

      <main id="main" className="mx-auto max-w-6xl px-4 sm:px-6">
        <section className="grid gap-10 pt-14 pb-16 sm:pt-20 lg:grid-cols-[minmax(0,1.12fr)_minmax(0,0.88fr)] lg:gap-14">
          <div className="min-w-0">
            <motion.h1
              initial={{ opacity: 0, y: reduce ? 0 : 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
              className="display text-[52px] leading-[0.98] text-ink sm:text-[72px] lg:text-[84px]"
            >
              Say the order.<br />Get one answer.
            </motion.h1>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.7, delay: 0.12 }}
              className="mt-6 max-w-[34rem] text-[17px] leading-relaxed text-ink-2"
            >
              Sounding walks the real Bitget book for your exact size, then holds it to your fee, your ceiling and your deadline. One decision, or a named refusal with the largest size that fits.
            </motion.p>
            <motion.div initial={{ opacity: 0, y: reduce ? 0 : 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.2, ease: [0.16, 1, 0.3, 1] }} className="mt-9">
              <AnalystPanel
                key={`chat-${epoch}`}
                symbol={symbol} side={side} amount={amount} ceiling={ceiling} mode={mode} userFee={userFee} fixture={fixture.sound}
                prefix={controls}
                onTurn={(t) => {
                  // The card shows the very result the analyst ruled on: one order, one book, one receipt.
                  if (t.symbol !== symbol) setFixture({});
                  setSymbol(t.symbol); setSide(t.side); setAmount(t.amount); setCeiling(t.ceiling); setUserFee(t.userFee); setActive("");
                  if (t.priced) { latest.current++; setBusy(false); setErr(null); setResp({ ...t.priced, universe: resp?.universe }); setAge(0); }
                }}
              />
            </motion.div>
          </div>

          <motion.aside initial={{ opacity: 0, y: reduce ? 0 : 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.25, ease: [0.16, 1, 0.3, 1] }} className="min-w-0 space-y-4 lg:sticky lg:top-24 lg:self-start">
            {err && <div className="rounded-2xl bg-over-bg px-4 py-3 text-[14px] text-over">{err}</div>}
            {res ? <DecisionCard res={res} side={side} code={code} busy={busy} freshness={freshness} stale={expired} onSuggestion={(a) => { setAmount(a); setActive(""); run({ amount: a }); }} /> : <div className="h-[420px] animate-pulse rounded-[22px] border border-rule-soft bg-paper-2/50" />}
            <div className="rounded-[22px] border border-rule-soft p-2">
              <div className="eyebrow px-3 pt-2 pb-1">recorded cases</div>
              <ul>
                {PRESETS.map((p) => (
                  <li key={p.id}>
                    <button onClick={() => preset(p)} aria-current={active === p.id} className={`group flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors duration-[var(--dur-micro)] ${active === p.id ? "bg-paper-3" : "hover:bg-paper-2"}`}>
                      <Play size={12} weight={active === p.id ? "fill" : "regular"} className="shrink-0 text-ink-3 group-hover:text-ink-2" />
                      <span className="min-w-0 flex-1 truncate text-[14px] text-ink-2 group-hover:text-ink">{p.label}</span>
                      <span className={`whitespace-nowrap mono text-[10px] ${p.tone === "within" ? "text-within" : p.tone === "over" ? "text-over" : "text-warn"}`}>{p.outcome}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </motion.aside>
        </section>

        {res?.ok && res.leg && resp && (
          <section id="walk" className="grid gap-10 border-t border-rule-soft py-20 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
            <div className="lg:sticky lg:top-28 lg:self-start">
              <Reveal>
                <h2 className="display text-[40px] leading-[1.05] text-ink sm:text-[52px]">Watch it sink through the book.</h2>
                <p className="mt-5 max-w-md text-[16px] leading-relaxed text-ink-2">
                  {side === "sell" ? "Selling takes the bids, best first." : "Buying takes the asks, best first."} {res.leg.status === "OK" ? "The deeper the order reaches, the worse its average price. Your verdict is two depths compared: where the average lands, and how deep your ceiling lets it go once your fee is paid." : `This order is deeper than the whole visible book: every level shown is taken and ${res.leg.visibleNotional} USDT is all there is.`}
                </p>
              </Reveal>
              {res.leg.status === "OK" && (
                <Reveal>
                  <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-rule-soft pt-6">
                    <Fact k="levels taken" v={String(res.leg.levelsConsumed)} />
                    <Fact k="average price" v={res.leg.vwap ?? "—"} />
                    <Fact k={side === "sell" ? "proceeds" : "spend"} v={`${res.leg.cash} USDT`} />
                    <Fact k="walking cost" v={`${res.leg.bpsPreFee} bps`} />
                  </dl>
                  {res.leg.thinTop && <p className="mt-5 text-[14px] text-warn">Thin top: the best level holds under a quarter of this order, so the quoted spread says little about your price.</p>}
                </Reveal>
              )}
              <a href="#last-look" className="mt-8 hidden items-center gap-2 text-[14px] text-ink-3 transition-colors hover:text-ink lg:inline-flex">Then re-check it <ArrowDown size={14} /></a>
            </div>
            <SoundingLine
              side={side}
              levels={resp.levels}
              mid={res.referenceMid!}
              qty={res.leg.qty}
              levelsConsumed={res.leg.levelsConsumed}
              avgBps={res.leg.status === "OK" ? res.leg.bpsPreFee : undefined}
              budgetBps={d && res.leg.status === "OK" ? res.ceilingBps - d.feeBps : undefined}
              feeLabel={d ? `${d.source === "user" ? "your" : "the worst-case"} ${d.feeBps} bps fee` : undefined}
            />
          </section>
        )}

        {res?.ok && res.alternatives && (
          <section className="border-t border-rule-soft py-20">
            <Reveal>
              <h2 className="display max-w-2xl text-[40px] leading-[1.05] text-ink sm:text-[52px]">Every route it priced, and what each costs you.</h2>
            </Reveal>
            <ul className="mt-10 grid gap-3 md:grid-cols-2">
              {res.alternatives.map((a) => {
                const A = ALT[a.kind];
                const priced = a.kind === "largest_within_ceiling" ? `≤ ${res.ceilingBps} bps, sized to your ceiling` : a.allInBpsByFee ? Object.entries(a.allInBpsByFee).filter(([f]) => !d || Number(f) === d.feeBps).map(([f, b]) => `${b} bps at ${f} bps fee`).join("") : a.price ? `at ${a.price}` : "not priced now";
                return (
                  <li key={a.kind} className="rounded-[20px] border border-rule-soft bg-paper-2/40 p-5 sm:p-6">
                    <div className="flex items-start gap-4">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-paper-3 text-ink-2"><A.icon size={18} weight="light" /></span>
                      <div className="min-w-0">
                        <div className="text-[16px] text-ink">{A.title}</div>
                        <div className="mono mt-1 text-[12px] text-sea">{a.qty ? `${a.qty} ${side === "buy" && a.kind === "largest_within_ceiling" ? "USDT" : "sh"} · ` : ""}{priced}</div>
                        <ul className="mt-3 space-y-1 text-[13px] leading-snug text-ink-3">{a.tradeoffs.map((t, j) => <li key={j}>{plain(t)}</li>)}</ul>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <section id="last-look" className="border-t border-rule-soft py-20">
          <Reveal>
            <h2 className="display max-w-3xl text-[40px] leading-[1.05] text-ink sm:text-[52px]">The slippage you accepted is the slippage you confirm.</h2>
          </Reveal>
          <div className="mt-10">
            {res?.ok && d?.verdict === "WITHIN_CEILING_ON_THIS_SNAPSHOT" && (mode === "live" || fixture.confirm) ? (
              <LastLookPanel key={`ll-${res.receipt.receipt_sha256}`} original={res} mode={mode} confirmFixture={fixture.confirm} confirmNote={fixture.confirmNote} />
            ) : (
              <div className="flex flex-wrap items-center gap-4 rounded-[22px] border border-rule-soft p-5 sm:p-7">
                <p className="min-w-0 flex-1 text-[15px] leading-relaxed text-ink-2">Last Look re-walks a fresh book when you confirm a decision that is within your ceiling. On a recorded book it needs a later capture; two are saved.</p>
                <div className="flex flex-wrap gap-2">
                  {PRESETS.filter((p) => p.confirmFixture).map((p) => (
                    <button key={p.id} onClick={() => { preset(p); document.getElementById("last-look")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth" }); }} className="rounded-full border border-rule px-4 py-2 text-[13px] text-ink transition-colors duration-[var(--dur-micro)] hover:bg-paper-3">{p.label}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="border-t border-rule-soft py-20">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <Reveal>
              <h2 className="display max-w-3xl text-[40px] leading-[1.05] text-ink sm:text-[52px]">Take Bitget away and it stops.</h2>
              <p className="mt-4 max-w-2xl text-[16px] leading-relaxed text-ink-2">The engine re-runs the lead order with each input withheld. Every removal refuses it or gets it wrong.</p>
            </Reveal>
            <a href="/bitget" className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-rule px-4 py-2 text-[13px] text-ink transition-colors duration-[var(--dur-micro)] hover:bg-paper-3">The full deletion test <ArrowRight size={13} /></a>
          </div>
          <div className="mt-10">{deletion ? <DeletionRows rows={deletion.rows} compact /> : <div className="h-[420px] animate-pulse rounded-[22px] border border-rule-soft bg-paper-2/40" />}</div>
        </section>

        <section className="border-t border-rule-soft py-20">
          <Reveal>
            <h2 className="display max-w-3xl text-[40px] leading-[1.05] text-ink sm:text-[52px]">Measured, not claimed.</h2>
          </Reveal>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-[14px]">
            <a href="/proof" className="inline-flex items-center gap-1.5 text-ink-2 hover:text-ink">Every proof, and what it cannot check <ArrowRight size={13} /></a>
            <a href="/how" className="inline-flex items-center gap-1.5 text-ink-2 hover:text-ink">How a decision is made <ArrowRight size={13} /></a>
          </div>
          <div className="mt-10"><Proof eligible={uni?.eligibleCount} total={uni?.total} source={uni ? (uni.source === "live" ? "live" : `recorded ${uni.fetched_utc.slice(0, 10)}`) : undefined} /></div>
        </section>

        {res && (
          <section className="border-t border-rule-soft py-12">
            <details className="group rounded-[22px] border border-rule-soft bg-paper-2/40 p-5 sm:p-6">
              <summary className="flex cursor-pointer list-none items-center gap-3">
                <span className="text-[15px] text-ink">Receipt</span>
                <span className="mono min-w-0 truncate text-[12px] text-ink-3">{res.receipt.receipt_sha256?.slice(0, 24)}</span>
                <CaretDown size={14} className="ml-auto text-ink-3 transition-transform duration-[var(--dur-short)] group-open:rotate-180" />
              </summary>
              <div className="mt-5 space-y-3 text-[13px] text-ink-2">
                <p>Hashes the inputs, the raw Bitget book and every number above{res.receipt.receipt_sig ? ", signed by this server" : ""}. It proves what was read and computed; it does not prove a fill, an executable price or future liquidity.</p>
                <div className="mono break-all text-[12px] text-ink-3">engine {res.receipt.engineVersion} · book {res.receipt.raw_sha256.slice(0, 16)} · exchange ts {res.receipt.exchange_ts} · rtt {res.receipt.rtt_ms} ms</div>
                {replayCmd && <pre className="mono overflow-x-auto rounded-xl bg-paper p-3 text-[12px] text-ink-2">{replayCmd}</pre>}
                <button onClick={() => { const blob = new Blob([JSON.stringify({ receipt: res.receipt, capture: resp!.capture, levels: resp!.levels }, null, 1)], { type: "application/json" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `sounding-${res.symbol}-${res.receipt.exchange_ts}.json`; a.click(); }} className="inline-flex items-center gap-2 rounded-full border border-rule px-4 py-2 text-[13px] text-ink transition-colors duration-[var(--dur-micro)] hover:bg-paper-3">
                  <DownloadSimple size={14} /> Download receipt
                </button>
              </div>
            </details>
          </section>
        )}
      </main>

      <Footer />
    </>
  );
}

function Pill({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="relative inline-flex items-center rounded-full border border-rule-soft bg-paper px-3 py-1.5 text-[12px] text-ink transition-colors duration-[var(--dur-micro)] focus-within:border-sea/60 hover:border-rule" title={label}>
      {children}
      <CaretDown size={11} className="pointer-events-none absolute right-2.5 text-ink-3" />
    </span>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block min-w-0">
      <span className="text-[11px] text-ink-3">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} inputMode="decimal" className="mono mt-1 w-full rounded-xl border border-rule-soft bg-paper px-3 py-2 text-[14px] text-ink placeholder:text-ink-3 focus:border-sea/60 focus:outline-none" />
    </label>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[13px] text-ink-3">{k}</dt>
      <dd className="mono mt-1 truncate text-[17px] text-ink">{v}</dd>
    </div>
  );
}
