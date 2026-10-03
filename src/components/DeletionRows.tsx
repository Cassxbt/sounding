"use client";

import { Brain, CalendarBlank, CheckCircle, Database, Ruler, Stack, XCircle } from "@phosphor-icons/react";
import type { DeletionRow, Outcome } from "@/lib/deletion";

const ICON = { book: Stack, stockInfo: Database, session: CalendarBlank, instruments: Ruler, qwen: Brain } as const;

/** Each sponsor input beside what the engine does without it. Both columns are computed, never written. */
export function DeletionRows({ rows, baseline, compact = false }: { rows: DeletionRow[]; baseline: Outcome; compact?: boolean }) {
  return (
    <ul className="divide-y divide-rule-soft overflow-hidden rounded-[22px] border border-rule-soft bg-paper-2/40">
      {rows.map((r) => {
        const I = ICON[r.id];
        const broke = !r.without.ok || r.without.within === false;
        return (
          <li
            key={r.id}
            className="reveal-view grid gap-5 p-5 sm:p-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)_minmax(0,1fr)] lg:items-start lg:gap-8"
          >
            <div className="flex min-w-0 gap-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-rule-soft bg-paper text-ink-2"><I size={18} weight="light" /></span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-[16px] text-ink">{r.name}</span>
                  <span className="text-[12px] text-ink-3">{r.source}</span>
                </div>
                {!compact && <p className="mt-1 text-[14px] leading-relaxed text-ink-3">{r.role}</p>}
                <code className="mono mt-2 block break-all text-[11px] text-sea/90">{r.callSite}</code>
              </div>
            </div>
            <div className="min-w-0">
              <div className="eyebrow mb-1.5">with it</div>
              <div className="flex items-center gap-2 text-[14px] text-within"><CheckCircle size={16} weight="fill" className="shrink-0" />{baseline.headline}</div>
            </div>
            <div className="min-w-0">
              <div className="eyebrow mb-1.5">without it</div>
              <div className={`flex items-center gap-2 text-[14px] ${broke ? "text-over" : "text-ink-2"}`}>
                <XCircle size={16} weight="fill" className="shrink-0" />
                <span className="min-w-0">{r.without.code ? <span className="mono text-[12px]">{r.without.code}</span> : r.without.headline}</span>
              </div>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-3">{r.id === "qwen" ? `${r.without.detail}. A trade that fits this trader is refused.` : r.without.detail}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
