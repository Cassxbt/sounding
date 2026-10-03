"use client";

import { BookOpenText, Broadcast, Record } from "@phosphor-icons/react";
import { Mark } from "./ui/Mark";

type Mode = "recorded" | "live";
interface Props {
  mode: Mode;
  onMode: (m: Mode) => void;
  eligible?: number;
  total?: number;
  session?: string;
}

/** Floating pill: the wordmark, what the data is, and the one switch that changes it. */
export function Nav({ mode, onMode, eligible, total, session }: Props) {
  return (
    <header className="sticky top-3 z-40 px-4">
      <nav className="mx-auto flex max-w-6xl items-center gap-3 rounded-full border rule bg-paper-2/80 py-1.5 pl-4 pr-1.5 backdrop-blur-md supports-[backdrop-filter]:bg-paper-2/60">
        <a href="/" className="flex items-center gap-2 text-ink" aria-label="Sounding, home">
          <Mark live={mode === "live"} />
          <span className="text-[15px] font-medium tracking-tight">Sounding</span>
        </a>
        <span className="hidden h-4 w-px bg-rule md:block" />
        <span className="hidden min-w-0 truncate mono text-[11px] text-ink-3 md:block">
          {eligible !== undefined ? <>{eligible} of {total?.toLocaleString("en-US")} rTokens weekend-tradable · {session?.replace("_", " ")}</> : "reading the Bitget universe…"}
        </span>
        <a href="/task" className="ml-auto inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] text-ink-2 transition-colors duration-[var(--dur-micro)] hover:text-ink">
          <BookOpenText size={16} weight="light" />
          <span className="hidden sm:inline">Frozen task</span>
        </a>
        <div role="radiogroup" aria-label="Data source" className="flex rounded-full bg-paper p-0.5">
          {(["recorded", "live"] as Mode[]).map((m) => (
            <button
              key={m}
              role="radio"
              aria-checked={mode === m}
              onClick={() => onMode(m)}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-[12px] transition-colors duration-[var(--dur-micro)] ${mode === m ? "bg-paper-3 text-ink" : "text-ink-3 hover:text-ink-2"}`}
            >
              {m === "live" ? <Broadcast size={14} weight={mode === m ? "fill" : "light"} className={mode === m ? "text-sea" : ""} /> : <Record size={14} weight={mode === m ? "fill" : "light"} />}
              {m}
            </button>
          ))}
        </div>
      </nav>
    </header>
  );
}
