import Link from "next/link";
import { Mark } from "./ui/Mark";

/** Every page closes on what Sounding will never do. */
export function Footer() {
  return (
    <footer className="mt-10 border-t border-rule-soft">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="flex items-center gap-3 text-ink"><Mark size={26} /><span className="display text-[34px] leading-none sm:text-[44px]">Nothing is sent to an exchange.</span></div>
        <p className="mt-5 max-w-3xl text-[13px] leading-relaxed text-ink-3">
          Books from Bitget&rsquo;s public spot order book; eligibility from stock-info; sessions from Bitget&rsquo;s market states and calendar, with daylight saving computed locally. Weekend liquidity is market-maker liquidity, and unfilled weekend limit orders are cancelled at the session switch. Analyst: Qwen 3.8 Max, held to code-checked rules. Built for Bitget AI Base Camp S2 by cassxbt.
        </p>
        <nav aria-label="Pages" className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-[13px]">
          <Link href="/" className="text-ink-2 hover:text-ink">Desk</Link>
          <Link href="/bitget" className="text-ink-2 hover:text-ink">Built on Bitget</Link>
          <Link href="/research" className="text-ink-2 hover:text-ink">Research</Link>
          <Link href="/how" className="text-ink-2 hover:text-ink">How it works</Link>
          <Link href="/proof" className="text-ink-2 hover:text-ink">Proof</Link>
        </nav>
      </div>
    </footer>
  );
}
