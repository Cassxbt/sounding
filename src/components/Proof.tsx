import { ChatsCircle, Equals, Funnel } from "@phosphor-icons/react";
import { Reveal } from "./ui/Reveal";

/** Only measured numbers. Each names how it was measured, so none of it reads as a claim. */
export function Proof({ eligible, total, source }: { eligible?: number; total?: number; source?: string }) {
  return (
    <div className="grid gap-px overflow-hidden rounded-[22px] border border-rule-soft bg-rule-soft md:grid-cols-[1.4fr_1fr_1fr]">
      <Reveal className="bg-paper p-6 sm:p-8">
        <ChatsCircle size={22} weight="light" className="text-sea" />
        <div className="mt-6 flex items-baseline gap-3">
          <span className="display text-[64px] leading-none text-ink num">142</span>
          <span className="mono text-[13px] text-ink-3">/ 151</span>
        </div>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-2">stated limits reached the engine correctly on 40 blind messages in English, 中文 and mixed, written by someone who never saw the code. A regex reader got <span className="text-ink num">19</span>.</p>
        <p className="mt-3 text-[12px] text-ink-3">Held-out set, run once and published unchanged, including its one wrong value.</p>
      </Reveal>
      <Reveal delay={0.06} className="bg-paper p-6 sm:p-8">
        <Funnel size={22} weight="light" className="text-sea" />
        <div className="mt-6 flex items-baseline gap-3">
          <span className="display text-[64px] leading-none text-ink num">{eligible ?? "—"}</span>
          <span className="mono text-[13px] text-ink-3">/ {total?.toLocaleString("en-US") ?? "—"}</span>
        </div>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-2">rTokens Bitget flags weekend-tradable in this {source ?? ""} universe. Everything else is refused on a weekend before a book is read.</p>
      </Reveal>
      <Reveal delay={0.12} className="bg-paper p-6 sm:p-8">
        <Equals size={22} weight="light" className="text-sea" />
        <div className="mt-6 display text-[40px] leading-none text-ink">Level for level</div>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-2">The public book Sounding walks matched the Bitget app&rsquo;s order book, price and size, on the day it was checked.</p>
      </Reveal>
    </div>
  );
}
