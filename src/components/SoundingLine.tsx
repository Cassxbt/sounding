"use client";

import { useRef } from "react";
import { motion, useMotionValue, useReducedMotion, useScroll, useTransform, type MotionValue } from "motion/react";

type Level = [string, string];

interface Props {
  side: "buy" | "sell";
  levels: { asks: Level[]; bids: Level[] };
  mid: string;
  /** shares the order takes from the book */
  qty?: string;
  levelsConsumed?: number;
  /** average pre-fee cost of the order, bps from mid */
  avgBps?: string;
  /** what the ceiling leaves for the walk at the deciding fee, bps from mid */
  budgetBps?: number;
  /** "your 8 bps fee" or "the worst-case 20 bps fee" */
  feeLabel?: string;
}


/**
 * The book as a depth chart: every level sits at its real distance from the mid, and the line
 * sinks through the levels this order consumes as the section scrolls into view.
 * Average cost and the ceiling budget sit on the same axis, so the verdict is a comparison of two depths.
 */
export function SoundingLine({ side, levels, mid, qty, levelsConsumed = 0, avgBps, budgetBps, feeLabel }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 80%", "center 45%"] });
  const still = useMotionValue(1);
  const progress = reduce ? still : scrollYProgress;

  const walk = side === "sell" ? levels.bids : levels.asks;
  const m = Number(mid);
  const all = walk.slice(0, Math.min(walk.length, Math.max(levelsConsumed + 6, 12), 24)).map(([p, q]) => ({ p, q: Number(q), bps: (Math.abs(Number(p) - m) / m) * 1e4 }));
  const deepest = Math.max(all.at(-1)?.bps ?? 1, budgetBps ?? 0, Number(avgBps ?? 0));
  const depth = (b: number) => (b / (deepest * 1.08)) * 100;
  const maxQ = Math.max(...all.map((l) => l.q), 1e-9);
  const consumedDepth = depth(all[Math.min(all.length, Math.max(1, levelsConsumed)) - 1]?.bps ?? 0);
  const req = qty ? Number(qty) : 0;
  // Shares available above each level, so the level the order stops in shows only the part it takes.
  const before = all.map((_, i) => all.slice(0, i).reduce((t, l) => t + l.q, 0));
  const rows = all.map((l, i) => {
    const cum = before[i] + l.q;
    const consumed = i < levelsConsumed;
    const frac = consumed ? (req > 0 && cum > req ? Math.max(0, (req - before[i]) / l.q) : 1) : 0;
    return { ...l, i, consumed, frac, y: depth(l.bps) };
  });
  // A size label under a depth marker's badge is hidden rather than overprinted.
  const markerYs = [avgBps ? depth(Number(avgBps)) : null, budgetBps ? depth(budgetBps) : null].filter((y): y is number => y !== null);
  // Label a level only when it sits far enough below the last labelled one to be read.
  const labelled = rows.reduce<{ last: number; ids: Set<number> }>((acc, r) => (r.y - acc.last >= 4.2 ? { last: r.y, ids: acc.ids.add(r.i) } : acc), { last: -100, ids: new Set() }).ids;

  const line = useTransform(progress, [0, 1], ["0%", `${consumedDepth}%`]);

  return (
    <div ref={ref} className="relative">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <span className="eyebrow">{side === "sell" ? "bids" : "asks"} by distance from mid {mid}</span>
        <span className="mono text-[10px] text-ink-3">0 bps</span>
      </div>
      <div className="relative h-[460px] sm:h-[560px] rounded-2xl border border-rule-soft bg-paper/50">
        {/* depth ticks */}
        {[0.25, 0.5, 0.75].map((t) => (
          <div key={t} className="absolute inset-x-0 border-t border-dashed border-rule-soft/80" style={{ top: `${t * 100}%` }}>
            <span className="absolute right-2 -translate-y-1/2 bg-paper/0 mono text-[9px] text-ink-3/70">{(deepest * 1.08 * t).toFixed(0)} bps</span>
          </div>
        ))}

        {/* the line */}
        <div className="absolute left-6 top-0 bottom-0 w-px bg-rule" />
        <motion.div className="absolute left-[23px] top-0 w-[3px] rounded-b-full bg-sea" style={{ height: line }} />
        <motion.div className="absolute left-[18px] h-3 w-[13px] -translate-y-1/2 rounded-b-[6px] rounded-t-[2px] bg-sea shadow-[0_0_0_4px_var(--paper)]" style={{ top: line }} />

        {rows.map((r) => <Row key={r.i} r={r} maxQ={maxQ} progress={progress} consumedDepth={consumedDepth} showLabel={labelled.has(r.i)} underMarker={markerYs.some((y) => Math.abs(y - r.y) < 4.5)} />)}

        {avgBps && <Marker y={depth(Number(avgBps))} tone="sea" label={`your average · ${avgBps} bps`} progress={progress} />}
        {budgetBps !== undefined && budgetBps > 0 && <Marker y={depth(budgetBps)} tone="ceiling" label={`ceiling at ${feeLabel} · ${budgetBps.toFixed(2)} bps`} progress={progress} />}
      </div>
      {walk.length > all.length && <div className="mono mt-2 text-[10px] text-ink-3">+{walk.length - all.length} deeper levels kept in the receipt</div>}
    </div>
  );
}

function Row({ r, maxQ, progress, consumedDepth, showLabel, underMarker }: { r: { p: string; q: number; bps: number; consumed: boolean; frac: number; y: number; i: number }; maxQ: number; progress: MotionValue<number>; consumedDepth: number; showLabel: boolean; underMarker: boolean }) {
  const at = consumedDepth > 0 ? r.y / consumedDepth : 1;
  const fill = useTransform(progress, [Math.max(0, at - 0.06), Math.min(1, at)], [0, r.frac]);
  const w = `${Math.max(2, (r.q / maxQ) * 100)}%`;
  return (
    <div className="absolute left-12 right-3 flex -translate-y-1/2 items-center gap-3" style={{ top: `${r.y}%` }}>
      <span className={`w-[64px] shrink-0 mono text-[11px] ${r.consumed ? "text-ink" : "text-ink-3"} ${showLabel ? "" : "opacity-0"}`}>{r.p}</span>
      <span className="relative h-[6px] min-w-0 flex-1">
        <span className="absolute inset-y-0 left-0 rounded-full bg-paper-3" style={{ width: w }} />
        <span className="absolute inset-y-0 left-0 overflow-hidden rounded-full" style={{ width: w }}>
          <motion.span className="block h-full origin-left bg-sea" style={{ scaleX: fill }} />
        </span>
      </span>
      <span className={`hidden w-[118px] shrink-0 text-right mono text-[10px] sm:block ${r.consumed ? "text-ink-2" : "text-ink-3"} ${showLabel && !underMarker ? "" : "opacity-0"}`}>
        {r.q.toLocaleString("en-US", { maximumFractionDigits: 2 })} sh · {r.bps.toFixed(1)}
      </span>
    </div>
  );
}

function Marker({ y, tone, label, progress }: { y: number; tone: "sea" | "ceiling"; label: string; progress: MotionValue<number> }) {
  const opacity = useTransform(progress, [0.55, 0.95], [0, 1]);
  return (
    <motion.div className="pointer-events-none absolute inset-x-0 z-10" style={{ top: `${y}%`, opacity }}>
      <div className={`border-t ${tone === "sea" ? "border-sea" : "border-dashed border-over"}`} />
      <span className={`absolute right-3 -translate-y-[calc(100%+3px)] rounded-full px-2 py-0.5 mono text-[10px] whitespace-nowrap ${tone === "sea" ? "bg-sea/15 text-sea" : "bg-over-bg text-over"}`}>{label}</span>
    </motion.div>
  );
}

