import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Prohibit } from "@phosphor-icons/react/ssr";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { DeletionRows } from "@/components/DeletionRows";
import { deletionTest, LEAD_TEXT } from "@/lib/deletion";

export const metadata: Metadata = {
  title: "Sounding · Built on Bitget",
  description: "The deletion test, run by the engine: withhold any Bitget input or Qwen and the order is refused or misjudged.",
};

const NOT_USED = [
  { name: "Agent Hub CLI, dry run", why: "In our keyless test its dry run accepted side=hold, a negative quantity and a missing quantity, so it cannot stand in for a safety check. Sounding never sends an order, so nothing here depends on it." },
  { name: "bitget-signal", why: "Every upstream feed we queried returned empty when checked on 2026-10-02. A signal with nothing in it would be decoration, so it is not on the page." },
  { name: "GetAgent", why: "A research assistant across assets. Its published material shows no walk of a Bitget book at a given size, which is the one thing a decision here rests on." },
];

/** Static at build: the engine runs the lead order with each input withheld. Readable without JavaScript. */
export default async function Bitget() {
  const t = await deletionTest();
  return (
    <>
      <Nav />
      <main id="main" className="mx-auto max-w-6xl px-4 sm:px-6">
        <section className="pt-16 pb-14 sm:pt-24">
          <h1 className="display max-w-4xl text-[48px] leading-[0.98] text-ink sm:text-[72px] lg:text-[84px]">Take Bitget away and it stops.</h1>
          <p className="mt-6 max-w-2xl text-[17px] leading-relaxed text-ink-2">
            One real order, run by the engine. With every Bitget input, the answer is <span className="text-within">{t.baseline.headline}</span>. Withhold any one of them and this is what the same engine does, on the same recorded book.
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
