"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowUp, Code, Eye, MinusCircle, Quotes, SealCheck, ShieldWarning, Sliders, CheckCircle, CircleNotch, Scales, Files } from "@phosphor-icons/react";
import { Mark } from "./ui/Mark";
import type { AnalystOutput, Constraints, EvidencePack } from "@/analyst/schema";
import type { FieldName, Intake, IntakeField } from "@/analyst/intake";

interface Turn { role: "user" | "assistant"; text: string }
/** Where each carried value came from: the trader's own words and whether code confirmed the reading. */
type Provenance = Partial<Record<FieldName, IntakeField>>;
interface AnalystResp { output: AnalystOutput; producedBy: "model" | "template"; provider?: string; model?: string; violations: { rule: string; detail: string }[]; modelOutputRejected?: AnalystOutput }

interface Props {
  symbol: string; side: "buy" | "sell"; amount: string; ceiling: number; mode: "recorded" | "live"; userFee: string;
  /** recorded book the page is showing, so the analyst reads the same one */
  fixture?: string;
  seed?: string;
  /** instrument and side controls, shown inside the composer */
  prefix?: ReactNode;
  /** size, ceiling and fee the engine used for this turn, when the trader's words changed them; the page re-sounds on them so Last Look confirms the same terms */
  onTerms?: (t: { amount: string; ceiling: number; userFee: string }) => void;
}

const DEMO_TURNS = [
  "Sell 178.4121 rHIMS. I pay 0.08% taker, keep it under half a percent all-in, and I must be out before the 8th.",
  "Make it 35 shares.",
  "Actually I can hold through the transition.",
];

/** One phrasing per language a Bitget trader is likely to type; each fills the composer, nothing is sent until they press send. */
const EXAMPLES: { label: string; text: string }[] = [
  { label: "English", text: DEMO_TURNS[0] },
  { label: "中文", text: "卖出178.4121股rHIMS，吃单手续费千分之0.8，总成本不超过千分之五，8号之前必须清仓。" },
  { label: "Mixed", text: "sell 178.4121 rHIMS, taker 万8, all-in 不超过 50bp, before the 8th 必须 flat" },
];

export function AnalystPanel({ symbol, side, amount, ceiling, mode, userFee, fixture, prefix, onTerms }: Props) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState(DEMO_TURNS[0]);
  const [state, setState] = useState<{ resp: AnalystResp; evidence: EvidencePack; constraints: Constraints } | null>(null);
  const [prov, setProv] = useState<{ fields: Provenance; held: IntakeField[]; reader: Intake["reader"] | null }>({ fields: {}, held: [], reader: null });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [arm, setArm] = useState<"model" | "template">("model");
  // A reply that arrives after the panel was reset (new symbol, side or mode) must not re-sound the page.
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  const reduce = useReducedMotion();
  const thread = useRef<HTMLDivElement>(null);
  useEffect(() => { thread.current?.lastElementChild?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "nearest" }); }, [turns.length, reduce]);

  async function send(text: string) {
    if (!text.trim()) return;
    const next = [...turns, { role: "user" as const, text }];
    setTurns(next); setBusy(true); setErr(null); setInput("");
    const body = {
      symbol, side, amount, ceilingBps: ceiling, mode, userFeeBps: userFee === "" ? undefined : Number(userFee),
      turns: next, constraints: state?.constraints, previous: state?.resp.output, analyst: arm, fixture: mode === "recorded" ? fixture : undefined,
    };
    pending.current = new AbortController();
    let r: Response, j;
    try {
      r = await fetch("/api/analyst", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: pending.current.signal });
      j = await r.json();
    } catch {
      if (!pending.current?.signal.aborted) { setBusy(false); setErr("analyst unavailable"); }
      return;
    }
    setBusy(false);
    if (!r.ok || !j.analyst) { setErr(j.error ?? j.note ?? "analyst unavailable"); if (j.constraints && state) setState({ ...state, constraints: j.constraints }); return; }
    const resp = j.analyst as AnalystResp;
    const read = j.intake as Intake | undefined;
    if (read) setProv((p) => {
      const fields = { ...p.fields };
      for (const f of read.fields.filter((x) => x.status === "accepted")) {
        if (f.name === "releaseDeadline") { fields.hardDeadlineNy = f; fields.mustBeFlat = f; }
        else fields[f.name] = f;
      }
      return { fields, held: read.fields.filter((x) => x.status !== "accepted"), reader: read.reader };
    });
    // Carry what the trader stated (checked intake), never the model's output, into the next turn.
    const carried: Constraints = j.constraints ?? j.intake?.constraints ?? resp.output.constraints;
    setState({ resp, evidence: j.evidence, constraints: carried });
    const terms = { amount: j.amount ?? amount, ceiling: j.ceilingBps ?? ceiling, userFee: j.userFeeBps === null || j.userFeeBps === undefined ? userFee : String(j.userFeeBps) };
    if (terms.amount !== amount || terms.ceiling !== ceiling || terms.userFee !== userFee) onTerms?.(terms);
    setTurns([...next, { role: "assistant", text: resp.output.clarification ?? resp.output.explanation }]);
    const idx = DEMO_TURNS.indexOf(text);
    if (idx >= 0 && idx < DEMO_TURNS.length - 1) setInput(DEMO_TURNS[idx + 1]);
  }

  const out = state?.resp.output;
  const replaced = state?.resp.producedBy === "template" && state.resp.violations.length > 0;
  return (
    <div className="space-y-6">
      <form
        onSubmit={(e) => { e.preventDefault(); send(input); }}
        className="group rounded-[22px] border rule bg-paper-2/80 p-2 shadow-[0_30px_80px_-40px_oklch(0%_0_0/0.8)] transition-colors duration-[var(--dur-short)] focus-within:border-sea/60"
      >
        <label htmlFor="say" className="sr-only">Your order, in your own words</label>
        <textarea
          id="say"
          rows={3}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(input); } }}
          placeholder="Say the order: size, your fee, your ceiling, your deadline. English or 中文."
          className="block w-full resize-none bg-transparent px-3 pt-3 pb-2 text-[17px] leading-relaxed text-ink placeholder:text-ink-3 focus:outline-none"
        />
        <div className="flex flex-wrap items-center gap-2 px-1 pb-1">
          {prefix}
          <div role="radiogroup" aria-label="Reader" className="ml-auto flex rounded-full bg-paper p-0.5 text-[11px]">
            {([["model", "Qwen"], ["template", "baseline"]] as const).map(([m, label]) => (
              <button type="button" key={m} role="radio" aria-checked={arm === m} onClick={() => setArm(m)} className={`rounded-full px-2.5 py-1 transition-colors duration-[var(--dur-micro)] ${arm === m ? "bg-paper-3 text-ink" : "text-ink-3 hover:text-ink-2"}`}>{label}</button>
            ))}
          </div>
          <button
            type="submit"
            disabled={busy || !input.trim()}
            aria-label={busy ? "Reading" : "Send"}
            className="inline-flex size-10 items-center justify-center rounded-full bg-ink text-paper transition-[transform,opacity] duration-[var(--dur-micro)] hover:-translate-y-px active:translate-y-0 disabled:opacity-40 disabled:hover:translate-y-0"
          >
            {busy ? <CircleNotch size={18} className="animate-spin" /> : <ArrowUp size={18} weight="bold" />}
          </button>
        </div>
      </form>

      {turns.length === 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="eyebrow mr-1">try</span>
          {EXAMPLES.map((x) => (
            <button key={x.label} type="button" onClick={() => setInput(x.text)} className="rounded-full border border-rule-soft px-3 py-1.5 text-[13px] text-ink-2 transition-colors duration-[var(--dur-micro)] hover:border-rule hover:text-ink">
              {x.label}
            </button>
          ))}
        </div>
      )}

      {turns.length > 0 && (
        <div ref={thread} className="space-y-3" aria-live="polite">
          <AnimatePresence initial={false}>
            {turns.map((t, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: reduce ? 0 : 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: reduce ? 0.15 : 0.35, ease: [0.16, 1, 0.3, 1] }}
                className={t.role === "user" ? "flex justify-end" : "flex gap-3"}
              >
                {t.role === "user" ? (
                  <p className="max-w-[88%] rounded-2xl rounded-br-md bg-paper-3 px-4 py-2.5 text-[15px] leading-relaxed text-ink">{t.text}</p>
                ) : (
                  <>
                    <span className="mt-1 text-ink-2"><Mark size={18} /></span>
                    <p className="min-w-0 text-[15px] leading-relaxed text-ink-2">{t.text}</p>
                  </>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
          {busy && <div className="flex items-center gap-3 pl-1 text-[13px] text-ink-3"><CircleNotch size={14} className="animate-spin" /> reading your words, then walking the book</div>}
        </div>
      )}
      {err && <div className="rounded-xl bg-over-bg px-4 py-3 text-[14px] text-over">{err}</div>}

      {out && state && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className="space-y-5">
          <ConstraintCard c={state.constraints} prov={prov} ceiling={ceiling} amount={amount} side={side} />

          <div className="rounded-[18px] border border-rule-soft bg-paper-2/50 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="eyebrow">the analyst rules</span>
              <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-paper px-2.5 py-1 mono text-[10px] text-ink-3">
                {state.resp.producedBy === "model" ? <>{state.resp.model} · checked</> : replaced ? <>template · model answer replaced</> : <>template</>}
              </span>
            </div>
            <div className="display mt-3 text-[30px] leading-tight text-ink">
              {out.recommendation ? ROUTE[out.recommendation] : out.clarification ? "One question first." : "No route meets every hard limit."}
            </div>
            <p className="mt-2 text-[14px] leading-relaxed text-ink-2">{out.bindingConstraint}</p>
            {out.changedBecause && <p className="mt-1 text-[13px] text-ink-3">{out.changedBecause}</p>}
            {replaced && (
              <div className="mt-3 flex items-start gap-2 rounded-xl bg-warn-bg/70 px-3 py-2 text-[13px] text-warn">
                <ShieldWarning size={16} className="mt-0.5 shrink-0" />
                <span>The model&rsquo;s answer broke {state.resp.violations.map((v) => v.rule.replace(/_/g, " ")).join(", ")}; it was replaced by the deterministic template.</span>
              </div>
            )}
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <Ruling title="admissible" items={out.admissible} ok />
              <Ruling title="excluded" items={out.excluded} />
            </div>
            {state.evidence.records.length > 0 && (
              <div className="mt-5 border-t border-rule-soft pt-4">
                <div className="eyebrow mb-2 flex items-center gap-1.5"><Files size={13} /> dated evidence · {state.evidence.source_kind.replace(/_/g, " ")}</div>
                <ul className="space-y-1.5 text-[13px]">
                  {state.evidence.records.map((r) => {
                    const use = out.evidence.find((e) => e.recordId === r.id);
                    return (
                      <li key={r.id} className={use?.relevant ? "text-ink-2" : "text-ink-3"}>
                        <span className={`mr-2 inline-block size-1.5 -translate-y-0.5 rounded-full ${use?.relevant ? "bg-sea" : "bg-rule"}`} />
                        {r.title} · {r.effective_date_ny ?? "undated"}{r.effective_date_ny && !r.time_known ? ", time not published" : ""} · <a className="underline decoration-rule underline-offset-2 hover:decoration-ink-3" href={r.source_url} target="_blank" rel="noreferrer">{r.source_type}</a>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}

function Ruling({ title, items, ok }: { title: string; items: { kind: string; reason: string }[]; ok?: boolean }) {
  return (
    <div>
      <div className="eyebrow mb-2">{title}</div>
      {items.length === 0 ? <div className="text-[13px] text-ink-3">none</div> : (
        <ul className="space-y-2.5">
          {items.map((a, i) => (
            <li key={i} className="flex gap-2 text-[13px] leading-snug">
              {ok ? <CheckCircle size={16} weight="fill" className="mt-px shrink-0 text-within" /> : <MinusCircle size={16} className="mt-px shrink-0 text-ink-3" />}
              <span><span className="text-ink">{ROUTE[a.kind] ?? a.kind}</span> <span className="text-ink-3">· {a.reason}</span></span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const ROUTE: Record<string, string> = { immediate_cross: "Cross now, full size", largest_within_ceiling: "The largest size that fits", resting_limit: "Rest a limit order", requote_at_switch: "Re-sound at the next session" };
const same = (f: IntakeField | undefined, v: unknown) => (f && Number(f.value) === Number(v) ? f : undefined);
const SOURCE: Record<IntakeField["source"], { label: string; icon: ReactNode }> = {
  "model+code": { label: "code-confirmed", icon: <SealCheck size={14} weight="fill" className="text-within" /> },
  model: { label: "model-read · words verified", icon: <Eye size={14} className="text-sea" /> },
  code: { label: "code-read", icon: <Code size={14} className="text-within" /> },
};

function ConstraintCard({ c, prov, ceiling, amount, side }: { c: Constraints; prov: { fields: Provenance; held: IntakeField[]; reader: Intake["reader"] | null }; ceiling: number; amount: string; side: "buy" | "sell" }) {
  const rows: { k: string; v: string; f?: IntakeField }[] = [
    // A quote is shown only beside the value it produced; a later form edit shows as "set in the form".
    { k: "size", v: `${amount} ${side === "buy" ? "USDT" : "sh"}`, f: same(prov.fields[side === "buy" ? "sizeQuoteUsdt" : "sizeShares"], amount) },
    { k: "ceiling", v: `${ceiling} bps`, f: same(prov.fields.ceilingBps, ceiling) },
    { k: "taker fee", v: c.takerFeeBps === null ? "unknown" : `${c.takerFeeBps} bps`, f: same(prov.fields.takerFeeBps, c.takerFeeBps) },
    { k: "deadline (NY)", v: c.hardDeadlineNy ?? "—", f: prov.fields.hardDeadlineNy },
    { k: "must be flat", v: c.mustBeFlat ? "yes" : "no", f: prov.fields.mustBeFlat },
    { k: "thesis", v: c.thesis ?? "—", f: prov.fields.thesis },
  ];
  return (
    <div className="rounded-[18px] border border-rule-soft bg-paper-2/50 p-5">
      <div className="eyebrow mb-3 flex items-center gap-1.5"><Scales size={13} /> what you said · what the engine used</div>
      <ul className="divide-y divide-rule-soft">
        {rows.map(({ k, v, f }) => (
          <li key={k} className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 gap-y-1 py-2.5 sm:grid-cols-[110px_120px_minmax(0,1fr)] sm:items-baseline">
            <span className="text-[13px] text-ink-3">{k}</span>
            <span className="mono text-[13px] text-ink">{v}</span>
            <span className="col-span-2 flex min-w-0 items-start gap-1.5 text-[13px] text-ink-2 sm:col-span-1">
              {f ? (
                <>
                  <Quotes size={13} weight="fill" className="mt-0.5 shrink-0 text-ink-3" />
                  <span className="min-w-0"><span className="text-ink">{f.span}</span> <span className="ml-1 inline-flex items-center gap-1 whitespace-nowrap mono text-[10px] text-ink-3">{SOURCE[f.source].icon}{SOURCE[f.source].label}</span></span>
                </>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-ink-3">
                  {prov.reader === "regex" ? <><Code size={13} /> regex baseline, no cited words</> : v === "—" || v === "unknown" || v === "no" ? "not stated" : <><Sliders size={13} /> set by hand</>}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
      {prov.held.map((f, i) => (
        <div key={i} className="mt-3 flex items-start gap-2 rounded-xl bg-warn-bg/70 px-3 py-2 text-[13px] text-warn">
          <ShieldWarning size={15} className="mt-0.5 shrink-0" />
          <span>{f.status === "conflict" ? "Held, not used" : "Ignored"}: {f.name} from &ldquo;{f.span}&rdquo; ({f.note})</span>
        </div>
      ))}
    </div>
  );
}
