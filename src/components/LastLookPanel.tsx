"use client";

import { useState } from "react";
import type { SoundingResult } from "@/engine/types";
import type { LastLookResult } from "@/engine/lastlook";
import { decidingRow, DEFAULT_LASTLOOK_TOLERANCE_BPS, MAX_DECISION_AGE_MS } from "@/engine/decision";

interface Props { original: SoundingResult; mode: "recorded" | "live"; confirmFixture?: string; confirmNote?: string }

const STATUS: Record<LastLookResult["status"], { label: string; cls: string }> = {
  STANDS_ON_FRESH_BOOK: { label: "stands on the fresh book", cls: "bg-within-bg text-within border-within" },
  VOID_STALE: { label: "void · stale", cls: "bg-over-bg text-over border-over" },
  VOID_GATE: { label: "void · gate", cls: "bg-over-bg text-over border-over" },
};

/** Applied at the moment the trader confirms: re-walk the book; the decision stands only if nothing material moved. */
export function LastLookPanel({ original, mode, confirmFixture, confirmNote }: Props) {
  const [look, setLook] = useState<LastLookResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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
  return (
    <section className="rounded-md border rule p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="mono text-[11px] uppercase tracking-[0.18em] text-ink-3">last look · confirm this decision</div>
          <p className="text-[12px] text-ink-3 mt-1">On confirm, the book is walked again. The decision stands only if every gate still passes, it is still within your ceiling at {deciding!.feeBps} bps fee{deciding!.source === "user" ? " (yours)" : " (worst case, fee unknown)"}, cost and price each moved at most {DEFAULT_LASTLOOK_TOLERANCE_BPS} bps, and {mode === "live" ? `the decision is under ${MAX_DECISION_AGE_MS / 60_000} minutes old` : `the two recorded captures are under ${MAX_DECISION_AGE_MS / 60_000} minutes apart (recorded mode measures capture times, not your wait)`}. Nothing is sent to an exchange.</p>
          {confirmNote && <p className="text-[12px] text-ink-2 mt-1">{confirmNote}</p>}
        </div>
        <button onClick={confirm} disabled={busy} className="rounded bg-ink text-paper px-4 py-2 mono text-[11px] uppercase tracking-[0.18em] disabled:opacity-50">{busy ? "re-walking…" : "re-check · nothing sent"}</button>
      </div>
      {err && <div className="mono text-[12px] text-over">{err}</div>}
      {look && (
        <div className="fade-up space-y-3">
          <div className={`inline-block rounded border-2 px-3 py-1 mono text-[12px] uppercase tracking-[0.14em] ${STATUS[look.status].cls}`}>{STATUS[look.status].label}</div>
          <ul className="text-sm text-ink-2 space-y-1">{look.reasons.map((r, i) => <li key={i}>— {r}</li>)}</ul>
          <table className="text-[12px] mono">
            <tbody>
              <tr><td className="pr-4 text-ink-3">read at</td><td>{new Date(Number(look.original.exchange_ts)).toISOString().replace("T", " ").slice(0, 23)}Z</td><td className="pl-4 text-ink-3">receipt</td><td>{look.original.receipt_sha256.slice(0, 16)}</td></tr>
              <tr><td className="pr-4 text-ink-3">confirmed on</td><td>{new Date(Number(look.fresh.receipt.exchange_ts)).toISOString().replace("T", " ").slice(0, 23)}Z (+{look.gapSeconds} s)</td><td className="pl-4 text-ink-3">receipt</td><td>{look.fresh.receipt.receipt_sha256?.slice(0, 16)}</td></tr>
              <tr><td className="pr-4 text-ink-3">cost drift</td><td>{look.driftBps ?? "—"} bps</td><td className="pl-4 text-ink-3">price drift</td><td>{look.priceDriftBps ?? "—"} bps</td></tr>
              <tr><td className="pr-4 text-ink-3">headroom when read</td><td>{look.headroomBps ?? "—"} bps under ceiling</td><td className="pl-4 text-ink-3">tolerance</td><td>{look.toleranceBps} bps</td></tr>
              <tr><td className="pr-4 text-ink-3">last look receipt</td><td colSpan={3}>{look.receipt_sha256.slice(0, 32)}</td></tr>
            </tbody>
          </table>
          <p className="text-[11px] text-ink-3">{signed ? "Receipt hash and server signature both verified before the re-walk." : "Receipt hash verified (integrity only: this deployment does not sign receipts)."}</p>
        </div>
      )}
    </section>
  );
}
