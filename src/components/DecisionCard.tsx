"use client";

import { useEffect } from "react";
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { ArrowRight, CheckCircle, Prohibit, Scissors, WarningCircle, XCircle } from "@phosphor-icons/react";
import type { FeeScenario, SoundingResult } from "@/engine/types";
import { decidingRow } from "@/engine/decision";
import { allInBps, allInFrom } from "@/engine/cost";
import { FEE_SCENARIO_SOURCES } from "@/engine/fees";


interface Props {
  res: SoundingResult;
  /** best bid for a sell, best ask for a buy: what the quote alone says */
  best?: string;
  side: "buy" | "sell";
  code: string;
  busy: boolean;
  freshness: string;
  stale: boolean;
  onSuggestion: (amount: string) => void;
}

const WITHIN = "WITHIN_CEILING_ON_THIS_SNAPSHOT";

/** Two decimals, unless rounding would hide which side of the ceiling the exact cost is on. */
function precise(res: SoundingResult, feeBps: number, shown: string): string {
  const exact = res.leg?.bpsPreFeeExact ? allInBps(res.leg, feeBps).toNumber() : NaN;
  if (!Number.isFinite(exact) || Number(shown) !== res.ceilingBps || exact === res.ceilingBps) return shown;
  for (let dp = 4; dp <= 10; dp++) if (Number(exact.toFixed(dp)) !== res.ceilingBps) return exact.toFixed(dp);
  return exact.toString();
}

/** Counts to the engine's figure once; the figure itself is never rounded differently from the receipt. */
function Figure({ value }: { value: string }) {
  const reduce = useReducedMotion();
  const decimals = value.split(".")[1]?.length ?? 0;
  const mv = useMotionValue(reduce ? Number(value) : 0);
  const text = useTransform(mv, (v) => v.toFixed(decimals));
  useEffect(() => {
    if (reduce) { mv.set(Number(value)); return; }
    const c = animate(mv, Number(value), { duration: 0.9, ease: [0.16, 1, 0.3, 1] });
    return () => c.stop();
  }, [value, reduce, mv]);
  return <motion.span className="num">{text}</motion.span>;
}

function Meter({ fees, ceiling, deciding }: { fees: FeeScenario[]; ceiling: number; deciding?: FeeScenario }) {
  const rows = [...fees].filter((f) => f.allInBps).sort((a, b) => a.feeBps - b.feeBps || (a.source === "user" ? -1 : 1));
  const top = Math.max(ceiling * 1.3, ...rows.map((f) => Number(f.allInBps))) * 1.06;
  const x = (v: number) => `${Math.min(100, (v / top) * 100)}%`;
  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-[92px_minmax(0,1fr)_52px] gap-3">
        <span />
        <span className="relative h-3"><span className="absolute -translate-x-1/2 whitespace-nowrap mono text-[10px] text-ink-3" style={{ left: x(ceiling) }}>ceiling {ceiling}</span></span>
      </div>
      {rows.map((f) => {
        const ok = f.verdict === WITHIN;
        const yours = f.source === "user";
        const isDeciding = deciding && f.source === deciding.source && f.feeBps === deciding.feeBps;
        return (
          <div key={`${f.source}-${f.feeBps}`} className="grid grid-cols-[92px_minmax(0,1fr)_52px] items-center gap-3">
            <span className={`inline-flex items-center gap-1 mono text-[11px] whitespace-nowrap ${yours ? "text-ink" : "text-ink-3"}`}>
              {ok ? <CheckCircle size={11} weight="fill" className="text-within" aria-label="within" /> : <XCircle size={11} weight="fill" className="text-over" aria-label="over" />}
              {f.feeBps} bps{yours ? " · you" : ""}
            </span>
            <span className="relative h-5">
              <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-rule" />
              <span className="absolute top-0 bottom-0 w-px bg-ink-3/70" style={{ left: x(ceiling) }} />
              <motion.span
                className={`absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full ${ok ? "bg-within" : "bg-over"} ${isDeciding ? "" : "opacity-45"}`}
                style={{ left: 0, transformOrigin: "left" }}
                initial={{ width: 0 }}
                animate={{ width: x(Number(f.allInBps)) }}
                transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              />
              <motion.span
                className={`absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-paper-2 ${ok ? "bg-within" : "bg-over"} ${isDeciding ? "" : "opacity-60"}`}
                initial={{ left: 0 }}
                animate={{ left: x(Number(f.allInBps)) }}
                transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              />
            </span>
            <span className={`mono text-[12px] text-right ${isDeciding ? (ok ? "text-within" : "text-over") : "text-ink-3"}`}>{f.allInBps}</span>
          </div>
        );
      })}
    </div>
  );
}

export function DecisionCard({ res, side, code, busy, freshness, stale, onSuggestion, best }: Props) {
  const d = decidingRow(res);
  const within = d?.verdict === WITHIN;
  const unknownFee = !res.fees?.some((f) => f.source === "user");
  const clip = res.alternatives?.find((a) => a.kind === "largest_within_ceiling");
  const order = side === "sell" ? `sell ${res.intent.side === "sell" ? res.intent.baseQty : ""} r${code}` : `buy r${code} with ${res.intent.side === "buy" ? res.intent.quoteBudget : ""} USDT`;

  return (
    <section aria-live="polite" className={`relative overflow-hidden rounded-[22px] border rule bg-paper-2/70 p-5 sm:p-6 transition-opacity duration-[var(--dur-short)] ${busy ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="eyebrow">the answer · {order}</span>
        <span className={`mono text-[10px] whitespace-nowrap ${stale ? "text-over" : "text-ink-3"}`}>{freshness}</span>
      </div>

      {!res.ok ? (
        <div className="mt-5 space-y-4">
          <div className="flex items-start gap-3">
            <Prohibit size={28} weight="light" className="mt-1 shrink-0 text-over" />
            <div className="min-w-0">
              <div className="display text-[34px] leading-[1.05] text-ink">Refused, with a reason.</div>
              <div className="mono mt-2 text-[11px] uppercase tracking-[0.12em] text-over">{res.gate}</div>
            </div>
          </div>
          <p className="text-[15px] leading-relaxed text-ink-2">{res.gateDetail}</p>
          {res.suggestion && (
            <button
              onClick={() => onSuggestion(res.suggestion!.baseQty ?? res.suggestion!.quoteBudget!)}
              className="group inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-paper transition-transform duration-[var(--dur-micro)] hover:-translate-y-px active:translate-y-0"
            >
              Use {res.suggestion.baseQty ?? `${res.suggestion.quoteBudget} USDT`} instead
              <ArrowRight size={14} className="transition-transform duration-[var(--dur-short)] group-hover:translate-x-0.5" />
            </button>
          )}
        </div>
      ) : res.leg?.status !== "OK" ? (
        <div className="mt-5 flex items-start gap-3">
          <WarningCircle size={28} weight="light" className="mt-1 shrink-0 text-warn" />
          <div>
            <div className="display text-[34px] leading-[1.05]">The visible book cannot carry it.</div>
            <p className="mt-3 text-[15px] text-ink-2">Visible {side === "sell" ? "bid" : "ask"} depth is {res.leg?.visibleNotional} USDT.{clip ? <> The largest size that fits your ceiling: <span className="mono text-ink">{clip.qty}</span> {side === "sell" ? "sh" : "USDT"}.</> : null}</p>
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <div className="flex items-end gap-3">
            <span className="display text-[76px] leading-[0.9] tracking-[-0.02em] text-ink sm:text-[92px]"><Figure value={precise(res, d!.feeBps, d!.allInBps!)} /></span>
            <span className="mb-2 mono text-[13px] text-ink-3">bps all-in</span>
          </div>
          <div className={`mt-4 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] font-medium ${within ? "bg-within-bg text-within" : "bg-over-bg text-over"}`}>
            {within ? <CheckCircle size={16} weight="fill" /> : <XCircle size={16} weight="fill" />}
            {within ? `Within your ${res.ceilingBps} bps ceiling` : `Over your ${res.ceilingBps} bps ceiling`}
          </div>
          {best && res.referenceMid && (() => {
            // The quote against the size, in one line: why the best price alone is not the answer.
            const mid = Number(res.referenceMid), top = allInFrom((Math.abs(Number(best) - mid) / mid) * 10000, d!.feeBps, side).toFixed(2);
            return <p className="mt-4 mono text-[13px] text-ink-2">best {side === "sell" ? "bid" : "ask"} alone {top} bps · your {res.intent.side === "sell" ? `${res.intent.baseQty} sh` : `${res.intent.quoteBudget} USDT`} {d!.allInBps} bps{!within && clip ? ` · ${clip.qty} ${side === "sell" ? "sh" : "USDT"} fit` : ""}</p>;
          })()}
          {res.worstCase && (
            <div className="mt-5 rounded-2xl bg-over-bg/60 px-4 py-3">
              <div className="flex items-center gap-2 text-[13px] text-over"><XCircle size={15} weight="fill" className="shrink-0" /> At {res.worstCase.feeBps} bps, {FEE_SCENARIO_SOURCES[res.worstCase.feeBps] ?? "a fee scenario"}: {res.worstCase.allInBps} bps, over.</div>
              {res.worstCase.clipQty && <div className="mt-1 flex items-start gap-2 text-[13px] text-ink-2"><Scissors size={14} className="mt-0.5 shrink-0 text-ink-3" /><span>Same book, the largest size that fits there: <span className="mono text-ink">{res.worstCase.clipQty}</span> {side === "sell" ? "sh" : "USDT"}, leaving {res.worstCase.remainder} unpriced.</span></div>}
            </div>
          )}
          {!within && clip && (
            <div className="mt-5 flex items-center gap-2 rounded-2xl bg-paper-3/70 px-4 py-3 text-[13px] text-ink-2">
              <Scissors size={15} className="shrink-0 text-ink-3" /><span>The largest size that fits now: <span className="mono text-ink">{clip.qty}</span> {side === "sell" ? "sh" : "USDT"}, leaving {clip.remainder} unpriced.</span>
            </div>
          )}
          <p className="mt-3 text-[14px] leading-relaxed text-ink-2">
            {unknownFee
              ? <>Your fee is not known yet, so the higher scenario decides ({d!.feeBps} bps, {FEE_SCENARIO_SOURCES[d!.feeBps] ?? "a fee scenario"}). {res.feeSensitive && <span className="text-warn">The answer flips with your fee: say it, and it decides.</span>}</>
              : <>At your {d!.feeBps} bps fee, on this {res.freshness.historical ? "recorded" : "live"} book: {res.leg.bpsPreFee} bps walking the book, plus your fee.</>}
          </p>
          <div className="mt-6 border-t border-rule-soft pt-5">
            <div className="eyebrow mb-3">the same order at every fee</div>
            {/* A stated fee equal to a scenario is one row: the trader's. */}
            <Meter fees={(res.fees ?? []).filter((f) => f.source === "user" || !res.fees!.some((u) => u.source === "user" && u.feeBps === f.feeBps))} ceiling={res.ceilingBps} deciding={d} />
          </div>
        </div>
      )}
    </section>
  );
}
