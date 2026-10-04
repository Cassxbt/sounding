"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Broadcast, List, Record, X } from "@phosphor-icons/react";
import { Mark } from "./ui/Mark";

type Mode = "recorded" | "live";
interface Props {
  /** the data-source switch only exists on the Desk */
  mode?: Mode;
  onMode?: (m: Mode) => void;
  eligible?: number;
  total?: number;
  /** where the universe count comes from: "live" or "recorded <date>" */
  source?: string;
}

const PAGES = [
  { href: "/", label: "Desk" },
  { href: "/bitget", label: "Built on Bitget" },
  { href: "/research", label: "Research" },
  { href: "/how", label: "How it works" },
  { href: "/proof", label: "Proof" },
];

/** Floating pill: the wordmark, the four pages, and on the Desk the one switch that changes the data. */
export function Nav({ mode, onMode, eligible, total, source }: Props) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);
  return (
    <header className="sticky top-3 z-40 px-4">
      <a href="#main" className="sr-only rounded-full bg-ink px-4 py-2 text-[13px] text-paper focus:not-sr-only focus:absolute focus:left-4 focus:top-0 focus:z-50">Skip to content</a>
      <nav aria-label="Main" className="mx-auto flex max-w-6xl items-center gap-2 rounded-full border rule bg-paper-2/80 py-1.5 pl-3 pr-1.5 backdrop-blur-md supports-[backdrop-filter]:bg-paper-2/60 sm:gap-3 sm:pl-4">
        <Link href="/" className="flex items-center gap-2 text-ink" aria-label="Sounding, the desk">
          <Mark live={mode === "live"} />
          <span className="text-[15px] font-medium tracking-tight">Sounding</span>
        </Link>
        <ul className="ml-3 hidden items-center gap-1 md:flex">
          {PAGES.map((p) => (
            <li key={p.href}>
              <a href={p.href} aria-current={path === p.href ? "page" : undefined} className={`whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] transition-colors duration-[var(--dur-micro)] ${path === p.href ? "bg-paper-3 text-ink" : "text-ink-3 hover:text-ink"}`}>{p.label}</a>
            </li>
          ))}
        </ul>
        {eligible !== undefined && <span className="ml-auto hidden min-w-0 truncate mono text-[11px] text-ink-3 xl:block">{eligible} of {total?.toLocaleString("en-US")} weekend-tradable · {source}</span>}
        <div className={`ml-auto flex items-center gap-1.5 ${eligible !== undefined ? "xl:ml-3" : ""}`}>
          {mode && onMode && (
            <div role="radiogroup" aria-label="Data source" className="flex rounded-full bg-paper p-0.5">
              {(["recorded", "live"] as Mode[]).map((m) => (
                <button
                  key={m}
                  role="radio"
                  aria-checked={mode === m}
                  onClick={() => onMode(m)}
                  className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1.5 text-[12px] transition-colors duration-[var(--dur-micro)] min-[400px]:px-3 ${mode === m ? "bg-paper-3 text-ink" : "text-ink-3 hover:text-ink-2"}`}
                >
                  {m === "live" ? <Broadcast size={14} weight={mode === m ? "fill" : "light"} className={mode === m ? "text-sea" : ""} /> : <Record size={14} weight={mode === m ? "fill" : "light"} />}
                  <span className="sr-only min-[400px]:not-sr-only">{m}</span>
                </button>
              ))}
            </div>
          )}
          <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="pages-menu" aria-label={open ? "Close pages" : "Pages"} className="inline-flex size-9 items-center justify-center rounded-full text-ink-2 hover:text-ink md:hidden">
            {open ? <X size={18} /> : <List size={18} />}
          </button>
        </div>
      </nav>
      <noscript>
        <ul className="mx-auto mt-2 flex max-w-6xl flex-wrap gap-x-5 gap-y-1 px-3 text-[14px] md:hidden">
          {PAGES.map((p) => <li key={p.href}><a href={p.href} className="text-ink-2">{p.label}</a></li>)}
        </ul>
      </noscript>
      <AnimatePresence>
        {open && (
          <motion.ul
            id="pages-menu"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4, transition: { duration: 0.15 } }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="mx-auto mt-2 max-w-6xl overflow-hidden rounded-3xl border rule bg-paper-2/95 p-2 backdrop-blur-md md:hidden"
          >
            {PAGES.map((p) => (
              <li key={p.href}>
                <a href={p.href} aria-current={path === p.href ? "page" : undefined} className={`block rounded-2xl px-4 py-3 text-[15px] ${path === p.href ? "bg-paper-3 text-ink" : "text-ink-2"}`}>{p.label}</a>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </header>
  );
}
