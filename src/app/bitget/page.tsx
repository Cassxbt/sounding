import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Prohibit } from "@phosphor-icons/react/ssr";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { DeletionRows } from "@/components/DeletionRows";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { deletionTest, LEAD_TEXT } from "@/lib/deletion";

export const metadata: Metadata = {
  title: "Sounding · Built on Bitget",
  description: "The deletion test, run by the engine: withhold any Bitget input or Qwen and the order is refused or misjudged.",
};

const NOT_USED = [
  { name: "bitget-signal", why: "Every upstream feed we queried returned empty when checked on 2026-10-02. A signal with nothing in it would be decoration, so it is not on the page." },
  { name: "Paper trading", why: "Bitget's demo environment lists 6 of the 90 weekend-tradable rTokens, all with empty books (checked 2026-10-05), so a paper fill would prove nothing about a real one. The order path is shown as a dry run instead." },
  { name: "GetAgent", why: "A research assistant across assets. Its published material shows no walk of a Bitget book at a given size, which is the one thing a decision here rests on." },
];

/** The same three orders through Agent Hub's dry run and through Sounding, as recorded in evidence/agenthub-20261008. */
function orderPath() {
  const dir = join(process.cwd(), "evidence/agenthub-20261008");
  const hub = readFileSync(join(dir, "bgc-dry-run.jsonl"), "utf8").trim().split("\n").map((l) => (JSON.parse(l) as { data: { wouldSend: Record<string, string> } }).data.wouldSend);
  const ours = readFileSync(join(dir, "sounding-prepare.txt"), "utf8").trim().split("\n").map((l) => JSON.parse(l.split(" => ")[1]) as { error?: string; fee?: { bps: number; source: string }; preparation?: { status: string; reason?: string; order?: { price: string }; proposal?: { size: string; unit: string }; binding?: { allInBps: string; worstCaseBps?: string; ceilingBps: number; fee: { bps: number; source: string } } } });
  return hub.map((h, i) => {
    const o = ours[i], p = o.preparation;
    const said = !p ? `rejected: ${o.error}` : p.status === "prepared" ? `prepared: ${p.binding!.allInBps} bps all-in at ${p.binding!.fee.bps} bps (${p.binding!.fee.source === "bitget_account" ? "the account's own fee, read through Agent Hub" : p.binding!.fee.source}), within ${p.binding!.ceilingBps}, as a limit IOC at ${p.order!.price}${p.binding!.worstCaseBps ? ` (at most ${p.binding!.worstCaseBps} bps if the better bids go before the send)` : ""}` : `refused: ${p.reason}${p.proposal ? `; ${p.proposal.size} ${p.proposal.unit} offered as a new order` : ""}`;
    return { order: `${h.side} ${h.qty} ${h.symbol}`, hub: "previews it", said, ok: p?.status === "prepared" };
  });
}

/** Static at build: the engine runs the lead order with each input withheld. Readable without JavaScript. */
export default async function Bitget() {
  const t = await deletionTest();
  const path = orderPath();
  return (
    <>
      <Nav />
      <main id="main" className="mx-auto max-w-6xl px-4 sm:px-6">
        <section className="pt-16 pb-14 sm:pt-24">
          <h1 className="display max-w-4xl text-[48px] leading-[0.98] text-ink sm:text-[72px] lg:text-[84px]">Take Bitget away and it stops.</h1>
          <p className="mt-6 max-w-2xl text-[17px] leading-relaxed text-ink-2">
            One real order, run by the engine. With every Bitget input, the answer is <span className={t.baseline.within ? "text-within" : "text-over"}>{t.baseline.headline}</span> your ceiling, with the largest size that fits named. Withhold any one of them and this is what the same engine does, on the same recorded book.
          </p>
          <blockquote className="mt-8 max-w-2xl border-l-2 border-sea pl-4 text-[16px] leading-relaxed text-ink">&ldquo;{LEAD_TEXT}&rdquo;</blockquote>
        </section>

        <section className="pb-20">
          <DeletionRows rows={t.rows} />
          <p className="mt-4 text-[13px] text-ink-3">Computed when this page was built, from the frozen fixtures, by the same <span className="mono">sound()</span> the desk calls. The build runs a test first that fails if any removal stops breaking it.</p>
        </section>

        <section className="grid gap-10 border-t border-rule-soft py-20 lg:grid-cols-2 lg:gap-16">
          <div>
            <h2 className="display text-[40px] leading-[1.05] text-ink sm:text-[52px]">Qwen reads. Code checks. Bitget decides.</h2>
          </div>
          <div className="space-y-5 text-[16px] leading-relaxed text-ink-2">
            <p>Qwen never does the arithmetic. It reads the trader&rsquo;s words, in English or 中文, and must quote them for every limit. Code finds each quote in the message and reads the number or date itself. Bitget&rsquo;s data then decides, and Qwen explains the ruling under rules code enforces.</p>
            <p>Without Qwen, the fallback reader takes the same sentence and finds {t.regexRead.fee === null ? "no fee" : `a ${t.regexRead.fee} bps fee`}, {t.regexRead.ceiling === null ? "no ceiling" : `a ${t.regexRead.ceiling} bps ceiling`} and {t.regexRead.deadline === null ? "no deadline" : `a deadline of ${t.regexRead.deadline}`}. It cannot answer on this trader&rsquo;s own limits, so it asks for them again: <span className="text-over">&ldquo;{t.regexRead.asked}&rdquo;</span></p>
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-rule-soft bg-rule-soft">
              <div className="bg-paper p-5"><div className="display text-[48px] leading-none text-ink">142<span className="mono text-[13px] text-ink-3"> / 151</span></div><p className="mt-2 text-[13px] text-ink-3">limits read correctly with Qwen, on 40 blind messages</p></div>
              <div className="bg-paper p-5"><div className="display text-[48px] leading-none text-ink-3">19<span className="mono text-[13px]"> / 151</span></div><p className="mt-2 text-[13px] text-ink-3">without it, by the regex reader</p></div>
            </div>
          </div>
        </section>

        <section className="border-t border-rule-soft py-20">
          <h2 className="display max-w-3xl text-[40px] leading-[1.05] text-ink sm:text-[52px]">The card says what you are sending. Sounding adds what it costs.</h2>
          <p className="mt-6 max-w-2xl text-[16px] leading-relaxed text-ink-2">Bitget Agent Hub lets an AI agent trade a Bitget account: its flow is a dry run, a confirmation card naming pair, side and quantity, then the send. Its own <span className="mono">pre_trade_check</span> reads the ticker price, the balance and the positions; nothing in it walks the book at the order&rsquo;s size. Sounding sits at that step: the agent reads the trader&rsquo;s own fee with Agent Hub&rsquo;s <span className="mono">account_overview</span> and passes it in, Sounding walks the book at the full size, and hands back the exact Agent Hub order only when it fits: a limit IOC at the deepest price it walked, bound to its receipt, so Bitget fills no share past that price. Anything else comes back as a reason. It is a check an agent chooses to run: it cannot stop a client that skips it, which is why the skill tells the agent to send only the order Sounding prepared.</p>
          <div className="mt-10 overflow-x-auto">
            <table className="w-full min-w-[640px] text-[14px]">
              <thead><tr className="text-left text-[12px] text-ink-3"><th className="pb-3 font-normal">order, recorded Sunday rHIMS book, 40 bps ceiling</th><th className="pb-3 font-normal">Agent Hub dry run (bgc 3.0.0)</th><th className="pb-3 font-normal">Sounding</th></tr></thead>
              <tbody>
                {path.map((r) => (
                  <tr key={r.order} className="border-t border-rule-soft align-top">
                    <td className="mono py-3 pr-4 text-ink">{r.order}</td>
                    <td className="py-3 pr-4 text-ink-3">{r.hub}</td>
                    <td className={`py-3 ${r.ok ? "text-within" : "text-over"}`}>{r.said}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 max-w-3xl text-[13px] text-ink-3">Recorded 2026-10-08 (evidence/agenthub-20261008). On a weekday Bitget routes rToken orders to NASDAQ/NYSE, so Sounding prices them only on weekends and US holidays, when Bitget&rsquo;s own book is the market. For agents: an MCP tool, <span className="mono">sounding_prepare_order</span>, and a skill in Agent Hub&rsquo;s own format that adds the at-size cost to its confirmation card and sends only the order Sounding prepared (<span className="mono">agent/</span> in the repository). The account fee was read with a read-only key on the developer&rsquo;s machine; this site holds no key.</p>
        </section>

        <section className="border-t border-rule-soft py-20">
          <h2 className="display max-w-3xl text-[40px] leading-[1.05] text-ink sm:text-[52px]">What it leaves out, and why.</h2>
          <ul className="mt-10 grid gap-3 md:grid-cols-3">
            {NOT_USED.map((n) => (
              <li key={n.name} className="rounded-[20px] border border-rule-soft p-5 sm:p-6">
                <div className="flex items-center gap-2 text-[16px] text-ink"><Prohibit size={16} className="text-ink-3" />{n.name}</div>
                <p className="mt-3 text-[14px] leading-relaxed text-ink-3">{n.why}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="border-t border-rule-soft py-16">
          <div className="flex flex-wrap gap-3">
            <Link href="/" className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-[14px] font-medium text-paper transition-transform duration-[var(--dur-micro)] hover:-translate-y-px">Try it on the desk <ArrowRight size={14} /></Link>
            <Link href="/proof" className="inline-flex items-center gap-2 rounded-full border border-rule px-5 py-3 text-[14px] text-ink transition-colors duration-[var(--dur-micro)] hover:bg-paper-3">See the proof</Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
