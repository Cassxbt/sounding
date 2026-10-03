"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowsClockwise, CheckCircle, CircleNotch, Fingerprint, XCircle } from "@phosphor-icons/react";
import type { SoundingResult } from "@/engine/types";
import type { LastLookResult } from "@/engine/lastlook";
import { decidingRow, DEFAULT_LASTLOOK_TOLERANCE_BPS, MAX_DECISION_AGE_MS } from "@/engine/decision";

interface Props { original: SoundingResult; mode: "recorded" | "live"; confirmFixture?: string; confirmNote?: string }

const STATUS: Record<LastLookResult["status"], { title: string; tone: "within" | "over" }> = {
  STANDS_ON_FRESH_BOOK: { title: "Stands on the fresh book.", tone: "within" },
  VOID_STALE: { title: "Void. The market moved.", tone: "over" },
  VOID_GATE: { title: "Void. A gate failed.", tone: "over" },
};

/** Applied at the moment the trader confirms: re-walk the book; the decision stands only if nothing material moved. */
export function LastLookPanel({ original, mode, confirmFixture, confirmNote }: Props) {
  const [look, setLook] = useState<LastLookResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const reduce = useReducedMotion();
  const deciding = decidingRow(original);
  const confirmable = original.ok && deciding?.verdict === "WITHIN_CEILING_ON_THIS_SNAPSHOT";
  if (!confirmable) return null;
  if (mode === "recorded" && !confirmFixture) return null;

  async function confirm() {
    setBusy(true); setErr(null);
    const r = await fetch("/api/confirm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ original, mode, freshFixture: confirmFixture }) });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) { setErr(j.error ?? "confirm failed"); setLook(null); return; }
    setLook(j.look);
  }

  const signed = !!original.receipt.receipt_sig;
  const s = look ? STATUS[look.status] : null;
  return (
    <div className="rounded-[22px] border rule bg-paper-2/60 p-5 sm:p-7">
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <div>
          <p className="max-w-xl text-[15px] leading-relaxed text-ink-2">
            Press re-check and the book is walked again. The decision stands only if every gate still passes, it is still inside your ceiling at {deciding!.feeBps} bps{deciding!.source === "user" ? " (your fee)" : " (worst case)"}, cost and price each moved at most {DEFAULT_LASTLOOK_TOLERANCE_BPS} bps, and {mode === "live" ? `the decision is under ${MAX_DECISION_AGE_MS / 60_000} minutes old` : `the two recorded captures are under ${MAX_DECISION_AGE_MS / 60_000} minutes apart (recorded mode measures capture times, not your wait)`}.
          </p>
          {confirmNote && <p className="mt-2 text-[13px] text-ink-3">{confirmNote}</p>}
        </div>
        <button
          onClick={confirm}
          disabled={busy}
          className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full bg-sea px-5 py-3 text-[14px] font-medium text-paper transition-transform duration-[var(--dur-micro)] hover:-translate-y-px active:translate-y-0 disabled:opacity-60"
        >
          {busy ? <CircleNotch size={16} className="animate-spin" /> : <ArrowsClockwise size={16} weight="bold" />}
          {busy ? "Re-walking the book" : "Re-check · nothing is sent"}
        </button>
      </div>
      {err && <div className="mt-4 rounded-xl bg-over-bg px-4 py-3 text-[14px] text-over">{err}</div>}

      <AnimatePresence mode="wait">
        {look && s && (
          <motion.div
            key={look.receipt_sha256}
            initial={{ opacity: 0, y: reduce ? 0 : 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0.15 : 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="mt-7 border-t border-rule-soft pt-6"
          >
            <div className="flex items-start gap-3">
              <motion.span initial={{ scale: reduce ? 1 : 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}>
                {s.tone === "within" ? <CheckCircle size={30} weight="fill" className="text-within" /> : <XCircle size={30} weight="fill" className="text-over" />}
              </motion.span>
              <div className="min-w-0">
                <div className={`display text-[32px] leading-tight ${s.tone === "within" ? "text-within" : "text-over"}`}>{s.title}</div>
                <ul className="mt-2 space-y-1 text-[14px] text-ink-2">{look.reasons.map((r, i) => <li key={i}>{r.charAt(0).toUpperCase() + r.slice(1)}.</li>)}</ul>
              </div>
            </div>

            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <Drift label="cost moved" value={look.driftBps} tolerance={look.toleranceBps} />
              <Drift label="price moved" value={look.priceDriftBps} tolerance={look.toleranceBps} />
            </div>

            <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 text-[13px] sm:grid-cols-4">
              <Stat k="time between books" v={formatGap(Number(look.gapSeconds))} />
              <Stat k="headroom when read" v={look.headroomBps ? `${look.headroomBps} bps` : "—"} />
              <Stat k="decision receipt" v={look.original.receipt_sha256.slice(0, 12)} mono />
              <Stat k="re-check receipt" v={look.receipt_sha256.slice(0, 12)} mono />
            </dl>
            <p className="mt-4 inline-flex items-center gap-2 text-[12px] text-ink-3">
              <Fingerprint size={14} />
              {signed ? "Receipt hash and server signature both verified before the re-walk." : "Receipt hash verified (integrity only: this deployment does not sign receipts)."}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Drift({ label, value, tolerance }: { label: string; value?: string; tolerance: number }) {
  const v = value === undefined ? null : Number(value);
  const span = Math.max(tolerance * 3, Math.abs(v ?? 0) * 1.15);
  const x = (n: number) => `${50 + (Math.max(-span, Math.min(span, n)) / span) * 50}%`;
  const inside = v !== null && Math.abs(v) <= tolerance;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[13px] text-ink-3">{label}</span>
        <span className={`mono text-[13px] ${v === null ? "text-ink-3" : inside ? "text-within" : "text-over"}`}>{v === null ? "—" : `${v > 0 ? "+" : ""}${value} bps`}</span>
      </div>
      <div className="relative mt-2 h-6">
        <span className="absolute inset-x-0 top-1/2 h-px bg-rule" />
        <span className="absolute top-1/2 h-3 -translate-y-1/2 rounded-sm bg-within-bg" style={{ left: x(-tolerance), right: `calc(100% - ${x(tolerance)})` }} />
        <span className="absolute top-0 bottom-0 w-px bg-ink-3" style={{ left: "50%" }} />
        {v !== null && <motion.span className={`absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-paper-2 ${inside ? "bg-within" : "bg-over"}`} initial={{ left: "50%" }} animate={{ left: x(v) }} transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }} />}
      </div>
      <div className="relative mt-1 h-3 mono text-[10px] text-ink-3">
        <span className="absolute -translate-x-1/2" style={{ left: x(-tolerance) }}>−{tolerance}</span>
        <span className="absolute -translate-x-1/2" style={{ left: "50%" }}>0</span>
        <span className="absolute -translate-x-1/2" style={{ left: x(tolerance) }}>+{tolerance}</span>
      </div>
    </div>
  );
}

function Stat({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-ink-3">{k}</dt>
      <dd className={`mt-0.5 truncate text-ink ${mono ? "mono" : ""}`}>{v}</dd>
    </div>
  );
}

function formatGap(s: number) {
  if (s < 120) return `${s.toFixed(1)} s`;
  if (s < 7200) return `${(s / 60).toFixed(1)} min`;
  if (s < 172800) return `${(s / 3600).toFixed(1)} h`;
  return `${(s / 86400).toFixed(1)} days`;
}
