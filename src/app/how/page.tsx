import type { Metadata } from "next";
import { ArrowsClockwise, Brain, ChatText, Scales, SealCheck, Stack } from "@phosphor-icons/react/ssr";
import type { Icon } from "@phosphor-icons/react";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { HowItDecides } from "@/components/HowItDecides";
import { Reveal } from "@/components/ui/Reveal";
import { sound } from "@/engine";
import { decidingRow } from "@/engine/decision";
import type { BookCapture } from "@/engine/types";
import { readBps, readDate } from "@/analyst/normalize";
import { recordedCapture, universe } from "@/lib/data";
import { LEAD_CEILING_WORDS, LEAD_FEE_WORDS, LEAD_TEXT } from "@/lib/lead";
import { templateAnalysis } from "@/analyst/template";
import { EMPTY_CONSTRAINTS } from "@/analyst";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { EvidencePack } from "@/analyst/schema";

export const metadata: Metadata = {
  title: "Sounding · How it works",
  description: "From the trader's words to a signed decision: who reads, who checks, who decides.",
};

interface Step { icon: Icon; who: string; title: string; body: string; here: string }

/** Static at build: each step shows what it produced for the lead order, from the code that runs on the desk. */
export default async function How() {
  const u = await universe("recorded");
  const capture = recordedCapture("RHIMSUSDT") as BookCapture;
  const fee = readBps(LEAD_FEE_WORDS)!, ceiling = readBps(LEAD_CEILING_WORDS)!;
  const res = sound({ capture, intent: { side: "sell", baseQty: "178.4121" }, ceilingBps: ceiling, userFeeBps: fee, now: new Date(Number(capture.exchange_ts)), historical: true, stockInfo: u.stockInfo, states: u.states, calendar: u.calendar, instruments: u.instruments });
  const d = decidingRow(res)!;
  const today = new Date(Number(capture.exchange_ts)).toISOString().slice(0, 10);
  const pack = JSON.parse(readFileSync(join(process.cwd(), "fixtures/evidence/RHIMSUSDT.json"), "utf8")) as EvidencePack;
  const ruling = templateAnalysis(res, pack, { ...EMPTY_CONSTRAINTS, takerFeeBps: fee, hardDeadlineNy: readDate("before the 8th", today), mustBeFlat: true });
  const say = (k: string) => ({ immediate_cross: "cross now", largest_within_ceiling: "largest size that fits", resting_limit: "rest a limit", requote_at_switch: "wait for the next session" })[k] ?? k;
  const steps: Step[] = [
    { icon: ChatText, who: "You", title: "Say the order", body: "Size, your fee, your ceiling, your deadline. In English, 中文 or both, the way a trader types it.", here: `"${LEAD_TEXT}"` },
    { icon: Brain, who: "Qwen 3.8 Max", title: "Reads your words", body: "Returns each limit with the exact words that state it. It never computes a price and never fills a default.", here: `for example: fee ← "${LEAD_FEE_WORDS}" · ceiling ← "${LEAD_CEILING_WORDS}" · deadline ← "before the 8th"` },
    { icon: SealCheck, who: "Code", title: "Checks every quote", body: "Finds the quoted words in your message and reads the number or date itself. A deadline is used only when code reads the same date; a disagreement is asked back.", here: `code reads ${fee} bps · ${ceiling} bps · ${readDate("before the 8th", today)}` },
    { icon: Stack, who: "Engine, on Bitget data", title: "Walks the book", body: "Seven gates in order, then the order is walked through Bitget's book at your size, in exact decimals, at your fee and every scenario.", here: `${res.leg?.levelsConsumed} levels · ${d.allInBps} bps all-in at ${d.feeBps} bps · ${d.verdict === "WITHIN_CEILING_ON_THIS_SNAPSHOT" ? "within" : "over"} ${res.ceilingBps}` },
    { icon: Scales, who: "Qwen, under rules", title: "Rules on the routes", body: "Which priced routes meet your limits, and why. Every answer is checked in code against 14 named rules; an answer that breaks one is replaced by a deterministic template.", here: `for this order, any answer must exclude: ${ruling.excluded.filter((e) => e.kind === "resting_limit" || e.kind === "largest_within_ceiling").map((a) => say(a.kind)).join(", ") || "nothing"} · may never recommend: wait for the next session` },
    { icon: ArrowsClockwise, who: "Engine", title: "Last Look, then a receipt", body: "When you confirm, a fresh book is walked again. Inputs, the raw book and every output are hashed and signed.", here: `receipt ${res.receipt.receipt_sha256?.slice(0, 20)}…` },
  ];
  return (
    <>
      <Nav />
      <main id="main" className="mx-auto max-w-6xl px-4 sm:px-6">
        <section className="pt-16 pb-16 sm:pt-24">
          <h1 className="display max-w-4xl text-[48px] leading-[0.98] text-ink sm:text-[72px] lg:text-[84px]">Words in, one decision out.</h1>
          <p className="mt-6 max-w-2xl text-[17px] leading-relaxed text-ink-2">The model reads and explains. Code checks what it read. Bitget&rsquo;s book decides. Each step below shows what it produced for the same order the desk opens on.</p>
        </section>

        <section className="pb-20">
          <ol className="relative grid gap-3 md:grid-cols-2">
            {steps.map((s, i) => (
              <Reveal as="li" key={s.title} className="relative rounded-[22px] border border-rule-soft bg-paper-2/40 p-5 sm:p-7">
                <div className="flex items-center gap-3">
                  <span className="mono text-[12px] text-ink-3">{String(i + 1).padStart(2, "0")}</span>
                  <span className="flex size-9 items-center justify-center rounded-full border border-rule-soft bg-paper text-ink-2"><s.icon size={17} weight="light" /></span>
                  <span className="text-[12px] text-ink-3">{s.who}</span>
                </div>
                <h2 className="display mt-5 text-[32px] leading-tight text-ink">{s.title}</h2>
                <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{s.body}</p>
                <p className="mono mt-4 rounded-xl bg-paper px-3 py-2.5 text-[12px] leading-relaxed text-sea">{s.here}</p>
              </Reveal>
            ))}
          </ol>
        </section>

        <section className="border-t border-rule-soft py-20">
          <h2 className="display max-w-3xl text-[40px] leading-[1.05] text-ink sm:text-[52px]">It refuses in order, and says which rule.</h2>
          <div className="mt-12"><HowItDecides res={res} /></div>
        </section>
      </main>
      <Footer />
    </>
  );
}
