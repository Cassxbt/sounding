"use client";

type Level = [string, string];

interface Props {
  side: "buy" | "sell";
  levels: { asks: Level[]; bids: Level[] };
  mid: string;
  /** shares required by the intent (buy: shares received; sell: shares to sell) */
  qty?: string;
  levelsConsumed?: number;
}

/**
 * The book as a sounding line: each level is a depth mark, the lead sinks through
 * the levels the order consumes. Sell walks the bids, buy walks the asks.
 */
export function SoundingLine({ side, levels, mid, qty, levelsConsumed = 0 }: Props) {
  const walk = side === "sell" ? levels.bids : levels.asks;
  const shown = walk.slice(0, 14);
  const m = Number(mid);
  const maxQty = Math.max(...shown.map(([, q]) => Number(q)), 1e-9);
  const req = qty ? Number(qty) : 0;
  let cum = 0;

  return (
    <div className="relative">
      <div className="mono text-[11px] uppercase tracking-[0.18em] text-ink-3 mb-3">
        {side === "sell" ? "bids the order sinks through" : "asks the order sinks through"} · reference mid {mid}
      </div>
      <div className="relative pl-14">
        <div className="absolute left-5 top-0 bottom-0 w-px bg-ink/30" />
        <div className="lead-drop absolute left-[19px] top-0 w-[3px] bg-sea rounded-b-full" style={{ height: `${Math.min(levelsConsumed, shown.length) * 34}px` }} />
        <ul className="space-y-[6px]">
          {shown.map(([p, q], i) => {
            const before = cum; cum += Number(q);
            const consumed = i < levelsConsumed;
            const partial = consumed && req > 0 && cum > req && before < req ? (req - before) / Number(q) : consumed ? 1 : 0;
            const bps = Math.abs(Number(p) - m) / m * 1e4;
            return (
              <li key={i} className="grid grid-cols-[64px_1fr_168px] items-center h-7 relative">
                <span className={`absolute -left-14 mono text-[11px] ${consumed ? "text-sea" : "text-ink-3"}`}>{i + 1}</span>
                <span className={`mono text-[13px] ${consumed ? "text-ink" : "text-ink-3"}`}>{p}</span>
                <span className="relative h-3 rounded-sm bg-paper-2 overflow-hidden">
                  <span className="absolute inset-y-0 left-0 bg-ink/15" style={{ width: `${(Number(q) / maxQty) * 100}%` }} />
                  <span className="absolute inset-y-0 left-0 bg-sea/80" style={{ width: `${(Number(q) / maxQty) * 100 * partial}%` }} />
                </span>
                <span className={`mono text-[11px] text-right whitespace-nowrap ${consumed ? "text-ink-2" : "text-ink-3"}`}>
                  {Number(q).toLocaleString(undefined, { maximumFractionDigits: 2 })} sh · {bps.toFixed(1)} bps
                </span>
              </li>
            );
          })}
        </ul>
      </div>
      {walk.length > shown.length && <div className="mono text-[11px] text-ink-3 mt-2 pl-14">+{walk.length - shown.length} deeper levels in the receipt</div>}
    </div>
  );
}
