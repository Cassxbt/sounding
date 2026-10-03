"use client";

import { useEffect, useMemo, useState } from "react";
import { SoundingLine } from "@/components/SoundingLine";
import { AnalystPanel } from "@/components/AnalystPanel";
import { LastLookPanel } from "@/components/LastLookPanel";
import type { SoundingResult } from "@/engine/types";

type Mode = "recorded" | "live";
interface Universe { source: string; fetched_utc: string; total: number; eligibleCount: number; eligible: { symbol: string; code: string; name: string }[]; session: { state: string; detail: string; ny: { tzName: string; weekday: string; date: string } }; now_utc: string }
interface Resp { result: SoundingResult; levels: { asks: [string, string][]; bids: [string, string][] }; universe: { source: string; fetched_utc: string }; capture: Record<string, unknown> }

const PRESETS = [
  { id: "hims-1", label: "Turn 1 · sell 178.4121 rHIMS, ceiling 50", symbol: "RHIMSUSDT", side: "sell", amount: "178.4121", ceiling: 50, note: "5,000 USDT at mid. Must be flat before the CAO transition effective Oct 9 (no time stated) — hard deadline Oct 8." },
  { id: "hims-2", label: "Turn 2 · make it 35 shares", symbol: "RHIMSUSDT", side: "sell", amount: "35", ceiling: 50, note: "Same book, same ceiling. Only the size changed." },
  { id: "ll-stands", label: "Last Look · confirm 21 s later (stands)", symbol: "RHIMSUSDT", side: "sell", amount: "178.4121", ceiling: 50, userFee: 8, fixture: "RHIMSUSDT@20261003a", confirmFixture: "RHIMSUSDT@20261003b", note: "Read on the Saturday book at 01:19:55 UTC, fee 8 bps. Confirm re-walks the real book captured 21 s later.", confirmNote: "Recorded demo: the confirm walks a real capture taken 21 s after the one you read. In live mode it walks the book at the moment you click." },
  { id: "ll-void", label: "Last Look · confirm a decision read on Sep 20 (void)", symbol: "RHIMSUSDT", side: "sell", amount: "178.4121", ceiling: 50, userFee: 8, fixture: "RHIMSUSDT", confirmFixture: "RHIMSUSDT@20261003b", note: "A decision read on the 2026-09-20 book, confirmed against the 2026-10-03 book: the stale decision Last Look exists to stop.", confirmNote: "Recorded demo: confirming a 13-day-old decision against a real later capture." },
  { id: "hims-precision", label: "rHIMS · sell 178.412132 (6 dp, refused)", symbol: "RHIMSUSDT", side: "sell", amount: "178.412132", ceiling: 50, note: "rHIMS accepts 4 decimal places. Sounding refuses and suggests a valid size instead of silently rounding." },
  { id: "spy-1k", label: "rSPY · buy 1,000 USDT (thin top)", symbol: "RSPYUSDT", side: "buy", amount: "1000", ceiling: 20, note: "Displayed spread 0.1 bps; the first ask is a ~$150 pin." },
  { id: "spmo-25k", label: "rSPMO · buy 25,000 USDT (insufficient depth)", symbol: "RSPMOUSDT", side: "buy", amount: "25000", ceiling: 50, note: "The visible book cannot cover the order." },
] as const;

const VERDICT: Record<string, { label: string; cls: string }> = {
  WITHIN_CEILING_ON_THIS_SNAPSHOT: { label: "within ceiling · this snapshot", cls: "bg-within-bg text-within" },
  OVER_CEILING_ON_THIS_SNAPSHOT: { label: "over ceiling · this snapshot", cls: "bg-over-bg text-over" },
  INSUFFICIENT_VISIBLE_DEPTH: { label: "insufficient visible depth", cls: "bg-warn-bg text-warn" },
};

export default function Page() {
  const [mode, setMode] = useState<Mode>("recorded");
  const [uni, setUni] = useState<Universe | null>(null);
  const [symbol, setSymbol] = useState("RHIMSUSDT");
  const [side, setSide] = useState<"buy" | "sell">("sell");
  const [amount, setAmount] = useState("178.4121");
  const [ceiling, setCeiling] = useState(50);
  const [userFee, setUserFee] = useState<string>("");
  const [note, setNote] = useState<string>(PRESETS[0].note);
  const [resp, setResp] = useState<Resp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [prevBps, setPrevBps] = useState<string | undefined>();
  const [age, setAge] = useState(0);
  const [fixture, setFixture] = useState<{ sound?: string; confirm?: string; confirmNote?: string }>({});

  useEffect(() => { fetch(`/api/universe?mode=${mode}`).then((r) => r.json()).then(setUni).catch(() => setUni(null)); }, [mode]);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("task");
    const p = PRESETS.find((x) => x.id === id);
    if (p) preset(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!resp || resp.result.freshness.historical) return;
    const t = setInterval(() => setAge(Date.now() - Number(resp.result.receipt.exchange_ts)), 500);
    return () => clearInterval(t);
  }, [resp]);

  const expired = !!resp && !resp.result.freshness.historical && age > 5000;

  async function run(over?: Partial<{ symbol: string; side: "buy" | "sell"; amount: string; ceiling: number; fixture: string; userFee: string }>) {
    setBusy(true); setErr(null);
    const fx = over?.fixture !== undefined ? over.fixture : fixture.sound;
    const fee = over?.userFee !== undefined ? over.userFee : userFee;
    const body = { symbol: over?.symbol ?? symbol, side: over?.side ?? side, amount: over?.amount ?? amount, ceilingBps: over?.ceiling ?? ceiling, userFeeBps: fee === "" ? undefined : Number(fee), mode, previousBpsPreFee: mode === "live" ? prevBps : undefined, fixture: mode === "recorded" ? fx : undefined };
    const r = await fetch("/api/sound", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) { setErr(j.error ?? "request failed"); setResp(null); return; }
    setResp(j); setAge(0);
    if (j.result?.leg?.bpsPreFee) setPrevBps(j.result.leg.bpsPreFee);
  }
  function preset(p: (typeof PRESETS)[number]) {
    const fx = "fixture" in p ? { sound: p.fixture as string, confirm: (p as { confirmFixture?: string }).confirmFixture, confirmNote: (p as { confirmNote?: string }).confirmNote } : {};
    const fee = "userFee" in p ? String(p.userFee) : "";
    setSymbol(p.symbol); setSide(p.side); setAmount(p.amount); setCeiling(p.ceiling); setNote(p.note); setMode("recorded"); setFixture(fx); setUserFee(fee);
    setTimeout(() => run({ symbol: p.symbol, side: p.side, amount: p.amount, ceiling: p.ceiling, fixture: fx.sound ?? "", userFee: fee }), 0);
  }

  const res = resp?.result;
  const replayCmd = useMemo(() => res ? `pnpm replay fixtures/${symbol === "RHIMSUSDT" ? "rhims-20260920T090235Z" : symbol === "RSPYUSDT" ? "rspy-20260920T0902Z" : "rspmo-20260920T0902Z"}.json ${side} ${amount} ${ceiling}` : "", [res, symbol, side, amount, ceiling]);

  return (
    <main className="mx-auto max-w-6xl px-6 py-10 md:py-14">
      <header className="flex flex-wrap items-end justify-between gap-6 border-b rule pb-6">
        <div>
          <h1 className="display text-5xl md:text-6xl leading-none tracking-tight">Sounding</h1>
          <p className="mt-3 max-w-xl text-ink-2">Take a sounding before you trade. Session access and real cost at your size, for Bitget rTokens. Nothing here is a fill, a forecast or a promise.</p>
        </div>
        <div className="mono text-[11px] uppercase tracking-[0.18em] text-ink-3 text-right leading-5">
          {uni ? (<>
            <div>{uni.eligibleCount} of {uni.total} rTokens weekend-tradable</div>
            <div>{uni.session.state.replace("_", " ")} · NY {uni.session.ny.weekday} {uni.session.ny.tzName}</div>
            <div>{uni.source} universe · {uni.fetched_utc.slice(0, 16).replace("T", " ")}Z</div>
          </>) : "loading universe…"}
        </div>
      </header>

      <section className="grid gap-10 md:grid-cols-[360px_1fr] mt-10">
        <aside className="space-y-6">
          <div>
            <div className="mono text-[11px] uppercase tracking-[0.18em] text-ink-3 mb-2">Saved tasks · recorded 2026-09-20</div>
            <div className="flex flex-col gap-2">
              {PRESETS.map((p) => (
                <button key={p.id} onClick={() => preset(p)} className="text-left rounded-md border rule bg-paper-2/60 hover:bg-paper-2 px-3 py-2 transition-colors">
                  <div className="text-sm">{p.label}</div>
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={(e) => { e.preventDefault(); run(); }} className="space-y-3 rounded-md border rule p-4 bg-paper-2/40">
            <div className="flex gap-2 mono text-[11px] uppercase tracking-[0.18em]">
              {(["recorded", "live"] as Mode[]).map((m) => (
                <button type="button" key={m} onClick={() => setMode(m)} className={`px-2 py-1 rounded ${mode === m ? "bg-ink text-paper" : "text-ink-3"}`}>{m}</button>
              ))}
            </div>
            <label className="block text-sm">Instrument
              <select value={symbol} onChange={(e) => setSymbol(e.target.value)} className="mono mt-1 w-full rounded border rule bg-paper px-2 py-1.5">
                {(uni?.eligible ?? [{ symbol: "RHIMSUSDT", code: "HIMS", name: "" }]).map((s) => <option key={s.symbol} value={s.symbol}>{s.symbol} · {s.code}</option>)}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-sm">Side
                <select value={side} onChange={(e) => setSide(e.target.value as "buy" | "sell")} className="mono mt-1 w-full rounded border rule bg-paper px-2 py-1.5"><option value="sell">sell shares</option><option value="buy">buy with USDT</option></select>
              </label>
              <label className="text-sm">{side === "sell" ? "Shares" : "USDT budget"}
                <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className="mono mt-1 w-full rounded border rule bg-paper px-2 py-1.5" />
              </label>
              <label className="text-sm">Ceiling (bps all-in)
                <input type="number" value={ceiling} onChange={(e) => setCeiling(Number(e.target.value))} className="mono mt-1 w-full rounded border rule bg-paper px-2 py-1.5" />
              </label>
              <label className="text-sm">Your taker fee (bps)
                <input value={userFee} onChange={(e) => setUserFee(e.target.value)} placeholder="unknown" inputMode="decimal" className="mono mt-1 w-full rounded border rule bg-paper px-2 py-1.5" />
              </label>
            </div>
            <button disabled={busy} className="w-full rounded bg-ink text-paper py-2 mono text-[12px] uppercase tracking-[0.18em] disabled:opacity-50">{busy ? "sounding…" : "take a sounding"}</button>
            <p className="text-[12px] text-ink-3 leading-5">Typed intent: sell is in shares, buy is a USDT budget. "Sell 5,000 USDT of X" is ambiguous and not accepted.</p>
          </form>
          {note && <p className="text-sm text-ink-2 border-l-2 border-sea pl-3">{note}</p>}
        </aside>

        <div className="space-y-8">
          {err && <div className="rounded-md bg-over-bg text-over px-4 py-3 mono text-sm">{err}</div>}
          {!res && !err && <div className="text-ink-3">Pick a saved task or take a live sounding.</div>}

          {res && (
            <div className="fade-up space-y-8">
              <div className="flex flex-wrap items-center gap-3">
                <Chip label={res.session.replace("_", " ")} title={res.sessionDetail} />
                {res.weekendTradable !== undefined && <Chip label={res.weekendTradable ? "weekendTradable = yes" : "weekendTradable = no"} cls={res.weekendTradable ? "bg-within-bg text-within" : "bg-over-bg text-over"} />}
                <Chip label={res.freshness.historical ? `recorded · exchange ts ${new Date(Number(res.receipt.exchange_ts)).toISOString().replace("T", " ").slice(0, 23)}Z` : expired ? "live · expired — resound" : `live · book age ${(age / 1000).toFixed(1)} s`} cls={expired ? "bg-over-bg text-over" : undefined} />
                {res.feeSensitive && <Chip label="FEE_SENSITIVE" cls="bg-warn-bg text-warn" />}
                {res.leg?.thinTop && <Chip label="thin top" cls="bg-warn-bg text-warn" title="first level < 25% of the order, next level ≥ 3 bps away, VWAP penalty ≥ 2 bps — a display flag, not a safety threshold" />}
              </div>

              {!res.ok && (
                <div className="rounded-md border-2 border-over bg-over-bg/60 p-5">
                  <div className="mono text-[11px] uppercase tracking-[0.18em] text-over">refused · {res.gate}</div>
                  <p className="mt-2 text-ink-2">{res.gateDetail}</p>
                  {res.suggestion && (
                    <button onClick={() => { const a = res.suggestion!.baseQty ?? res.suggestion!.quoteBudget!; setAmount(a); run({ amount: a }); }} className="mt-3 mono text-[11px] uppercase tracking-[0.18em] underline">
                      use {res.suggestion.baseQty ?? `${res.suggestion.quoteBudget} USDT`} instead · {res.suggestion.reason}
                    </button>
                  )}
                </div>
              )}

              {res.ok && res.leg && (
                <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
                  <div className="space-y-6">
                    <div>
                      <div className="mono text-[11px] uppercase tracking-[0.18em] text-ink-3">{side === "sell" ? "sell" : "buy"} · one leg · pre-fee vs mid {res.referenceMid}</div>
                      <div className="display text-6xl leading-none mt-2">{res.leg.status === "OK" ? res.leg.bpsPreFee : "—"}<span className="text-2xl text-ink-3 ml-2">bps</span></div>
                      <div className="mono text-sm text-ink-2 mt-2">
                        {res.leg.status === "OK" ? <>{side === "sell" ? "proceeds" : "spend"} {res.leg.cash} USDT · {res.leg.qty} sh · vwap {res.leg.vwap} · {res.leg.levelsConsumed} levels</> : <>visible {side === "sell" ? "bid" : "ask"} depth {res.leg.visibleNotional} USDT cannot cover this order</>}
                      </div>
                    </div>
                    <table className="w-full text-sm">
                      <thead><tr className="mono text-[11px] uppercase tracking-[0.18em] text-ink-3 text-left"><th className="py-1 pr-4 font-normal whitespace-nowrap">fee / leg</th><th className="pr-4 font-normal">all-in</th><th className="font-normal whitespace-nowrap">verdict vs {res.ceilingBps} bps</th></tr></thead>
                      <tbody>
                        {res.fees!.map((f) => (
                          <tr key={`${f.source}-${f.feeBps}`} className="border-t rule">
                            <td className="mono py-2 pr-4">{f.feeBps} bps{f.source === "user" && <span className="text-ink-3"> · yours</span>}</td>
                            <td className="mono pr-4">{f.allInBps ?? "—"}</td>
                            <td><span className={`mono text-[10px] uppercase tracking-[0.1em] px-2 py-0.5 rounded whitespace-nowrap ${VERDICT[f.verdict].cls}`}>{VERDICT[f.verdict].label}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {res.feeSensitive && <p className="text-sm text-warn">The verdict depends on your actual fee. Enter your taker rate; nothing here defaults to a rate.</p>}
                    <div>
                      <div className="mono text-[11px] uppercase tracking-[0.18em] text-ink-3 mb-2">priced alternatives</div>
                      <ul className="space-y-2">
                        {res.alternatives!.map((a, i) => (
                          <li key={i} className="rounded border rule bg-paper-2/40 px-3 py-2">
                            <div className="text-sm">
                              <span className="mono">{a.kind.replace(/_/g, " ")}</span>
                              {a.qty && <span className="mono text-ink-2"> · {a.qty} {side === "buy" && a.kind === "largest_within_ceiling" ? "USDT" : "sh"}</span>}
                              {a.price && <span className="mono text-ink-2"> · at {a.price}</span>}
                              {a.allInBpsByFee && <span className="mono text-ink-2"> · {Object.entries(a.allInBpsByFee).map(([f, b]) => `${b}@${f}`).join(" / ")}</span>}
                            </div>
                            <div className="text-[12px] text-ink-3 mt-1">{a.tradeoffs.join(" · ")}</div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  <SoundingLine side={side} levels={resp!.levels} mid={res.referenceMid!} qty={res.leg.qty} levelsConsumed={res.leg.levelsConsumed} />
                </div>
              )}

              {res.ok && <LastLookPanel key={`ll-${res.receipt.receipt_sha256}`} original={res} mode={mode} confirmFixture={fixture.confirm} confirmNote={fixture.confirmNote} />}

              {res.ok && <AnalystPanel key={`${symbol}-${mode}`} symbol={symbol} side={side} amount={amount} ceiling={ceiling} mode={mode} userFee={userFee} onConstraints={(c) => { if (c.takerFeeBps !== null && userFee === "") setUserFee(String(c.takerFeeBps)); }} onAmount={(a) => { setAmount(a); setTimeout(() => run({ amount: a }), 0); }} />}

              <details className="rounded-md border rule bg-paper-2/40 p-4">
                <summary className="mono text-[11px] uppercase tracking-[0.18em] cursor-pointer">receipt · {res.receipt.receipt_sha256?.slice(0, 16)} · raw book {res.receipt.raw_sha256.slice(0, 16)}</summary>
                <div className="mt-3 space-y-2 text-[12px] text-ink-2">
                  <div>Source: {res.receipt.source}</div>
                  <div className="mono">exchange_ts {res.receipt.exchange_ts} · request_start {res.receipt.request_start_utc} · rtt {res.receipt.rtt_ms} ms · clock offset {res.receipt.clock_offset_ms ?? "unmeasured"} ms · engine {res.receipt.engineVersion}</div>
                  <div className="mono">replay offline: <code className="bg-paper px-1">{replayCmd || "pnpm replay <capture.json> <side> <amount> <ceiling>"}</code></div>
                  <button onClick={() => { const blob = new Blob([JSON.stringify({ receipt: res.receipt, capture: resp!.capture, levels: resp!.levels }, null, 1)], { type: "application/json" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `sounding-${res.symbol}-${res.receipt.exchange_ts}.json`; a.click(); }} className="mono text-[11px] uppercase tracking-[0.18em] underline">download receipt json</button>
                  <p className="text-ink-3">A hash proves byte integrity of the captured book and this calculation. It does not prove a fill, an executable price, or future liquidity.</p>
                </div>
              </details>
            </div>
          )}
        </div>
      </section>

      <footer className="mt-16 border-t rule pt-4 mono text-[11px] text-ink-3 leading-5">
        Source: Bitget public spot orderbook (matched the Bitget UI level-for-level for rHOOD on 2026-09-20; the whitelisted Reality depth feed was not compared). Eligibility from /api/v3/reality/market/stock-info; session from /market/states + /market/calendar with DST computed locally. Weekend liquidity is market-maker liquidity; unfilled weekend limit orders are cancelled at the session switch (Bitget Stock 2.0 FAQ). Built for Bitget AI Base Camp S2 by xi labs.
      </footer>
    </main>
  );
}

function Chip({ label, cls, title }: { label: string; cls?: string; title?: string }) {
  return <span title={title} className={`mono text-[11px] uppercase tracking-[0.12em] px-2 py-1 rounded ${cls ?? "bg-paper-2 text-ink-2"}`}>{label}</span>;
}
