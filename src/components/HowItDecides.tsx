"use client";

import type { Icon } from "@phosphor-icons/react";
import { ArrowsClockwise, Book, CalendarCheck, Clock, Fingerprint, Lock, Pulse, Quotes, Ruler, ShieldCheck, Stack, Timer } from "@phosphor-icons/react";
import type { SoundingResult } from "@/engine/types";

interface Step { icon: Icon; name: string; does: string; now?: string }

/** The order the engine refuses in, and the rules the model is held to. Live values come from the sounding on screen. */
export function HowItDecides({ res }: { res?: SoundingResult }) {
  const live = res && !res.freshness.historical;
  const gates: Step[] = [
    { icon: Book, name: "Instrument", does: "Listed on Bitget, with its quantity precision and minimum order.", now: res?.spec ? `${res.symbol} · ${res.spec.quantityPrecision} dp · min ${res.spec.minOrderAmount} USDT` : undefined },
    { icon: Clock, name: "Session", does: "US session or weekend market-maker session, from Bitget's own states and calendar.", now: res?.session.replace("_", " ") },
    { icon: CalendarCheck, name: "Weekend eligibility", does: "Only names Bitget flags weekend-tradable are sounded on a weekend.", now: res?.weekendTradable === undefined ? undefined : res.weekendTradable ? "weekendTradable · yes" : "weekendTradable · no" },
    { icon: Ruler, name: "Exchange constraints", does: "A size the exchange would reject is refused with one it would accept.", now: res?.gate === "INVALID_QUANTITY_PRECISION" || res?.gate === "BELOW_MIN_ORDER" ? res.gate.toLowerCase().replace(/_/g, " ") : res?.ok ? "valid size" : undefined },
    { icon: Stack, name: "Book validity", does: "Empty, crossed or malformed books are refused, never walked.", now: res?.ok ? "valid book" : undefined },
    { icon: Timer, name: "Freshness", does: "Live books older than 5 s, or slower than 2 s to arrive, are refused.", now: res ? (live ? `${res.freshness.exchangeAgeMs ?? "—"} ms old` : "recorded book · not applied") : undefined },
    { icon: Pulse, name: "Stability", does: "Two live soundings more than 10 bps apart mark the quote unstable.", now: res ? (live ? "checked between soundings" : "single recorded sounding") : undefined },
  ];
  const guards: Step[] = [
    { icon: Quotes, name: "Checked reading", does: "Qwen must quote your exact words for every limit; code finds those words and re-reads them. A deadline is used only when code reads the same date." },
    { icon: Lock, name: "Tighten only", does: "What you state is the floor. The model may add a stricter limit, never relax yours." },
    { icon: ShieldCheck, name: "Rule checks", does: "Invented numbers, promises, loosened limits or a re-quote passed off as an exit: the model's answer is replaced by the template." },
    { icon: ArrowsClockwise, name: "Last Look", does: "Confirming re-walks a fresh book. Ten bps of drift, a flipped verdict or a two-minute-old decision voids it." },
    { icon: Fingerprint, name: "Signed receipt", does: "Inputs, raw book hash and every output are hashed and signed by the server; replay reproduces the hash offline." },
  ];
  return (
    <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
      <Column title="Seven gates, in the order it refuses" steps={gates} numbered />
      <Column title="Five rules the model is held to" steps={guards} />
    </div>
  );
}

function Column({ title, steps, numbered }: { title: string; steps: Step[]; numbered?: boolean }) {
  return (
    <div>
      <h3 className="text-[15px] font-medium text-ink">{title}</h3>
      <ol className="relative mt-6 space-y-1">
        <span className="absolute left-[19px] top-3 bottom-3 w-px bg-rule-soft" aria-hidden />
        {steps.map((s, i) => (
          <li key={s.name} className="relative grid grid-cols-[40px_minmax(0,1fr)] gap-4 rounded-2xl p-2 transition-colors duration-[var(--dur-short)] hover:bg-paper-2/50">
            <span className="relative z-10 flex size-10 items-center justify-center rounded-full border border-rule-soft bg-paper text-ink-2">
              <s.icon size={18} weight="light" />
            </span>
            <span className="min-w-0 pt-1">
              <span className="flex flex-wrap items-baseline gap-x-2">
                {numbered && <span className="mono text-[11px] text-ink-3">{i + 1}</span>}
                <span className="text-[15px] text-ink">{s.name}</span>
                {s.now && <span className="mono text-[11px] text-sea">{s.now}</span>}
              </span>
              <span className="mt-1 block text-[14px] leading-relaxed text-ink-3">{s.does}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
