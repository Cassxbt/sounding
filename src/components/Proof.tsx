import Link from "next/link";
import { ArrowRight, ChartBar, ChatsCircle, ListChecks } from "@phosphor-icons/react";
import { Reveal } from "./ui/Reveal";

/**
 * Only measured numbers, each one a published held-out run or a recorded snapshot that never changes,
 * and each linked to where it is recomputed or stored.
 */
export function Proof() {
  const tiles = [
    { icon: ListChecks, n: "24", d: "30", line: "whole tasks done right, written blind and run once through the real route. The same set without the model: 11, with 11 critical errors to its 3.", href: "/proof", go: "Proof" },
    { icon: ChatsCircle, n: "142", d: "151", line: "limits read correctly from 40 blind messages in English, 中文 and mixed. A regex reader got 19.", href: "/proof", go: "Proof" },
    { icon: ChartBar, n: "57", d: "89", line: "names where Bitget's best ask is inside a 50 bps ceiling but a 25,000 USDT buy is not, on one recorded Sunday.", href: "/research", go: "Research" },
  ];
  return (
    <div className="grid gap-px overflow-hidden rounded-[22px] border border-rule-soft bg-rule-soft md:grid-cols-3">
      {tiles.map((t) => (
        <Reveal key={t.n} className="flex flex-col bg-paper p-6 sm:p-8">
          <t.icon size={22} weight="light" className="text-sea" />
          <div className="mt-6 flex items-baseline gap-3">
            <span className="display text-[64px] leading-none text-ink num">{t.n}</span>
            <span className="mono text-[13px] text-ink-3">/ {t.d}</span>
          </div>
          <p className="mt-3 flex-1 text-[15px] leading-relaxed text-ink-2">{t.line}</p>
          <Link href={t.href} className="mt-5 inline-flex items-center gap-1.5 text-[13px] text-ink-3 hover:text-ink">{t.go} <ArrowRight size={12} /></Link>
        </Reveal>
      ))}
    </div>
  );
}
