"use client";

import { useState } from "react";
import type { AnalystOutput, Constraints, EvidencePack } from "@/analyst/schema";

interface Turn { role: "user" | "assistant"; text: string }
interface AnalystResp { output: AnalystOutput; producedBy: "model" | "template"; provider?: string; model?: string; violations: { rule: string; detail: string }[]; modelOutputRejected?: AnalystOutput }

interface Props {
  symbol: string; side: "buy" | "sell"; amount: string; ceiling: number; mode: "recorded" | "live"; userFee: string;
  seed?: string;
  onConstraints?: (c: Constraints) => void;
  onAmount?: (amount: string) => void;
}

const DEMO_TURNS = [
  "Sell 178.4121 rHIMS now. Ceiling 50 bps all-in. I hold this on the GLP-1 thesis; I must be flat before the CAO transition takes effect on October 9, so hard deadline October 8.",
  "My taker fee is 8 bps.",
  "Make it 35 shares.",
  "Actually I can hold through the transition.",
];

export function AnalystPanel({ symbol, side, amount, ceiling, mode, userFee, onConstraints, onAmount }: Props) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState(DEMO_TURNS[0]);
  const [state, setState] = useState<{ resp: AnalystResp; evidence: EvidencePack; constraints: Constraints } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [arm, setArm] = useState<"model" | "template">("model");

  async function send(text: string) {
    if (!text.trim()) return;
    const next = [...turns, { role: "user" as const, text }];
    setTurns(next); setBusy(true); setErr(null); setInput("");
    const body = {
      symbol, side, amount, ceilingBps: ceiling, mode, userFeeBps: userFee === "" ? undefined : Number(userFee),
      turns: next, constraints: state?.constraints, previous: state?.resp.output, analyst: arm,
    };
    const r = await fetch("/api/analyst", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    setBusy(false);
    if (!r.ok || !j.analyst) { setErr(j.error ?? j.note ?? "analyst unavailable"); return; }
    const resp = j.analyst as AnalystResp;
    setState({ resp, evidence: j.evidence, constraints: resp.output.constraints });
    onConstraints?.(resp.output.constraints);
    if (j.amount && j.amount !== amount) onAmount?.(j.amount);
    setTurns([...next, { role: "assistant", text: resp.output.clarification ?? resp.output.explanation }]);
    const idx = DEMO_TURNS.indexOf(text);
    if (idx >= 0 && idx < DEMO_TURNS.length - 1) setInput(DEMO_TURNS[idx + 1]);
  }

  const out = state?.resp.output;
  return (
    <section className="rounded-md border rule bg-paper-2/30 p-5 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="mono text-[11px] uppercase tracking-[0.18em] text-ink-3">analyst · which priced alternative serves your thesis?</div>
          <p className="text-[12px] text-ink-3 mt-1">The engine's numbers are fixed. The analyst reads your constraints and dated evidence, rules alternatives in or out, and asks one question when a missing constraint changes the answer. Every answer is checked against structural rules; a violating model answer is replaced by the template and flagged.</p>
        </div>
        <div className="flex gap-2 mono text-[11px] uppercase tracking-[0.18em]">
          {(["model", "template"] as const).map((m) => <button key={m} onClick={() => setArm(m)} className={`px-2 py-1 rounded ${arm === m ? "bg-ink text-paper" : "text-ink-3"}`}>{m}</button>)}
        </div>
      </div>

      <div className="space-y-2">
        {turns.map((t, i) => (
          <div key={i} className={`text-sm leading-6 ${t.role === "user" ? "text-ink" : "text-ink-2 border-l-2 border-sea pl-3"}`}>
            <span className="mono text-[10px] uppercase tracking-[0.18em] text-ink-3 mr-2">{t.role === "user" ? "you" : "analyst"}</span>{t.text}
          </div>
        ))}
      </div>

      <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex gap-2">
        <input value={input} onChange={(e) => setInput(e.target.value)} className="flex-1 rounded border rule bg-paper px-3 py-2 text-sm" placeholder="Tell the analyst your constraints…" />
        <button disabled={busy} className="rounded bg-ink text-paper px-4 mono text-[11px] uppercase tracking-[0.18em] disabled:opacity-50">{busy ? "…" : "send"}</button>
      </form>
      {err && <div className="mono text-[12px] text-over">{err}</div>}

      {out && state && (
        <div className="grid gap-5 md:grid-cols-2 fade-up">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Tag label={`produced by ${state.resp.producedBy}${state.resp.producedBy === "model" ? ` · ${state.resp.provider} · ${state.resp.model}` : ""}`} />
              {state.resp.violations.map((v, i) => <Tag key={i} label={`rule: ${v.rule}`} cls="bg-over-bg text-over" title={v.detail} />)}
              <Tag label={`binding: ${out.bindingConstraint}`} cls="bg-warn-bg text-warn" />
            </div>
            <div>
              <div className="mono text-[11px] uppercase tracking-[0.18em] text-ink-3 mb-1">recommendation</div>
              <div className="display text-3xl">{out.recommendation ? out.recommendation.replace(/_/g, " ") : out.clarification ? "waiting on your answer" : "none satisfies every hard constraint"}</div>
              {out.changedBecause && <div className="text-[12px] text-ink-2 mt-1">{out.changedBecause}</div>}
            </div>
            <Constraint c={out.constraints} />
          </div>
          <div className="space-y-3">
            <List title="admissible" items={out.admissible} cls="text-within" />
            <List title="excluded" items={out.excluded} cls="text-over" />
            <div>
              <div className="mono text-[11px] uppercase tracking-[0.18em] text-ink-3 mb-1">evidence · {state.evidence.source_kind.replace(/_/g, " ")}</div>
              <ul className="space-y-1 text-[12px]">
                {state.evidence.records.map((r) => {
                  const use = out.evidence.find((e) => e.recordId === r.id);
                  return (
                    <li key={r.id} className={use?.relevant ? "text-ink" : "text-ink-3"}>
                      <span className="mono">{use?.relevant ? "●" : "○"}</span> {r.title} — {r.effective_date_ny ?? "undated"}{r.effective_date_ny && !r.time_known ? ", time not published" : ""} · <a className="underline" href={r.source_url} target="_blank" rel="noreferrer">{r.source_type}</a>
                      {use && <div className="text-ink-3 pl-4">{use.reason}</div>}
                    </li>
                  );
                })}
                {state.evidence.records.length === 0 && <li className="text-ink-3">no evidence available for this instrument; the analyst reasons on constraints only</li>}
              </ul>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function Tag({ label, cls, title }: { label: string; cls?: string; title?: string }) {
  return <span title={title} className={`mono text-[10px] uppercase tracking-[0.12em] px-2 py-1 rounded ${cls ?? "bg-paper-2 text-ink-2"}`}>{label}</span>;
}
function List({ title, items, cls }: { title: string; items: { kind: string; reason: string }[]; cls: string }) {
  return (
    <div>
      <div className="mono text-[11px] uppercase tracking-[0.18em] text-ink-3 mb-1">{title}</div>
      {items.length === 0 ? <div className="text-[12px] text-ink-3">none</div> : (
        <ul className="space-y-1 text-[12px]">{items.map((a, i) => <li key={i}><span className={`mono ${cls}`}>{a.kind.replace(/_/g, " ")}</span> <span className="text-ink-2">— {a.reason}</span></li>)}</ul>
      )}
    </div>
  );
}
function Constraint({ c }: { c: Constraints }) {
  const rows: [string, string][] = [
    ["thesis", c.thesis ?? "—"], ["hard deadline (NY)", c.hardDeadlineNy ?? "—"], ["must be flat", String(c.mustBeFlat)],
    ["exclusive exposure", String(c.exclusiveExposure)], ["proxy consent", String(c.proxyConsent)], ["taker fee", c.takerFeeBps === null ? "unknown" : `${c.takerFeeBps} bps`],
  ];
  return (
    <div>
      <div className="mono text-[11px] uppercase tracking-[0.18em] text-ink-3 mb-1">constraints carried across turns</div>
      <table className="text-[12px]"><tbody>{rows.map(([k, v]) => <tr key={k}><td className="text-ink-3 pr-3 py-0.5">{k}</td><td className="mono">{v}</td></tr>)}</tbody></table>
    </div>
  );
}
