import { NextResponse } from "next/server";
import { sound } from "@/engine";
import type { Intent, SoundingResult } from "@/engine/types";
import { LiveMetadataUnavailable, universe } from "@/lib/data";
import { bookFor, errorJson, HttpError, parseAmount, parseTerms } from "@/lib/terms";
import { answerTimeCheck, type AnswerCheck } from "@/lib/answercheck";
import { evidenceFor } from "@/analyst/evidence";
import { EMPTY_CONSTRAINTS, replyLanguage, runAnalyst, type AnalystTurn } from "@/analyst";
import { validate } from "@/analyst/rules";
import { intake } from "@/analyst/intake";
import { templateAnalysis } from "@/analyst/template";
import { nyClock } from "@/engine/session";
import type { AnalystOutput, Constraints } from "@/analyst/schema";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Body {
  symbol: string; side: "buy" | "sell"; amount: string; ceilingBps?: unknown; userFeeBps?: unknown; mode: "recorded" | "live";
  turns: AnalystTurn[]; constraints?: Constraints; previous?: AnalystOutput; analyst?: "model" | "template"; fixture?: string;
}

/** An answer with no route: the question that must be settled before anything can be priced. */
const ask = (constraints: Constraints, clarification: string): AnalystOutput => ({
  constraints, clarification, admissible: [], excluded: [], recommendation: null, bindingConstraint: clarification, evidence: [], changedBecause: null, explanation: clarification,
});

const levelsOf = (c: { raw: { data: { asks: [string, string][]; bids: [string, string][] } } }) => ({ asks: c.raw.data.asks.slice(0, 40), bids: c.raw.data.bids.slice(0, 40) });

export async function POST(req: Request) {
  const b = (await req.json()) as Body;
  const mode = b.mode === "live" ? "live" : "recorded";
  try {
    const terms = parseTerms(b);
    const controlsAmount = parseAmount(b.amount);
    const u = await universe(mode);
    const listed = u.stockInfo.map((s) => ({ code: s.code, symbol: s.symbol }));
    const codeOf = (sym: string) => u.stockInfo.find((s) => s.symbol === sym)?.code ?? sym.replace(/^R|USDT$/g, "");

    // "Today" for reading dates is the clock of the book on the controls, so recorded dates resolve as they did then.
    const controlsBook = await bookFor(mode, b.symbol, b.fixture);
    const today = nyClock(controlsBook.historical ? new Date(Number(controlsBook.capture.exchange_ts)) : new Date()).date;
    const lastUser = [...(b.turns ?? [])].reverse().find((t) => t.role === "user")?.text ?? "";
    const read = await intake(lastUser, { ...EMPTY_CONSTRAINTS, ...(b.constraints ?? {}) }, today, b.analyst === "template" ? "template" : "model", listed);

    // The order is what the words say; the controls only fill what the words leave out.
    const order = { symbol: read.symbol ?? b.symbol, side: read.side ?? b.side };
    const switched = order.symbol !== b.symbol || order.side !== b.side;
    const constraints: Constraints = { ...read.constraints, takerFeeBps: read.constraints.takerFeeBps ?? terms.userFeeBps ?? null };
    // A size that does not read as a positive number is treated as not stated, and asked for.
    const positive = (v?: string) => { try { return v ? parseAmount(v) : undefined; } catch { return undefined; } };
    // An open question means nothing is priced: no card, no routes, only the question.
    if (read.clarification) return NextResponse.json({ result: null, order, actionable: false, analyst: { output: ask(constraints, read.clarification), producedBy: "template", violations: [] }, constraints, intake: read });
    const sized = positive(order.side === "buy" ? read.sizeQuoteUsdt : read.sizeShares);
    const otherUnit = order.side === "buy" ? read.sizeShares : read.sizeQuoteUsdt;
    // A size in the other unit is never swapped for the controls' size: buys are USDT, sells are shares.
    if (!sized && (switched || otherUnit)) {
      const q = order.side === "buy"
        ? `${otherUnit ? "A buy is priced by the USDT you spend, not shares. " : ""}How many USDT do you want to spend on r${codeOf(order.symbol)}?`
        : `${otherUnit ? "A sell is priced in shares, not USDT. " : ""}How many shares of r${codeOf(order.symbol)} do you want to sell?`;
      return NextResponse.json({ result: null, order, analyst: { output: ask(constraints, q), producedBy: "template", violations: [] }, constraints, intake: read });
    }
    const amount = sized ?? controlsAmount;
    const intent: Intent = order.side === "buy" ? { side: "buy", quoteBudget: amount } : { side: "sell", baseQty: amount };

    let book;
    try { book = switched ? await bookFor(mode, order.symbol) : controlsBook; }
    catch (e) {
      if (e instanceof HttpError && e.status === 404) return NextResponse.json({ result: null, order, analyst: null, constraints, intake: read, note: `No recorded book for r${codeOf(order.symbol)}. Switch to live to sound it.` });
      throw e;
    }
    const ceilingBps = read.ceilingBps ?? terms.ceilingBps;
    const userFee = constraints.takerFeeBps ?? undefined;
    // Values read from the chat are held to the same bounds as values typed in the form.
    for (const [field, v, bound] of [["fee", userFee, "0 to 1,000"], ["ceiling", ceilingBps, "0 to 10,000"]] as const) {
      try { parseTerms(field === "fee" ? { userFeeBps: v } : { ceilingBps: v }); }
      catch { return NextResponse.json({ result: null, order, actionable: false, analyst: { output: ask(constraints, `A ${field} of ${v} bps is outside ${bound} bps. What is your ${field === "fee" ? "taker fee" : "cost ceiling"}, exactly?`), producedBy: "template", violations: [] }, constraints, intake: read }); }
    }
    const price = (capture = book.capture, now = book.historical ? new Date(Number(capture.exchange_ts)) : new Date()): SoundingResult =>
      sound({ capture, intent, ceilingBps, now, historical: book.historical, stockInfo: u.stockInfo, states: u.states, calendar: u.calendar, instruments: u.instruments, userFeeBps: userFee });
    let result = price();
    let capture = book.capture;
    const base = { order, amount, ceilingBps, userFeeBps: userFee ?? null, constraints, intake: read, fixtureFile: book.fixtureFile, sessionInputs: { states: u.states, calendar: u.calendar } };
    if (!result.ok) return NextResponse.json({ ...base, result, levels: levelsOf(capture), capture, analyst: null, note: `engine refused: ${result.gate}${result.suggestion ? `; use ${result.suggestion.baseQty ?? `${result.suggestion.quoteBudget} USDT`} instead` : ""}` });

    const evidence = await evidenceFor(order.symbol, codeOf(order.symbol), mode);
    // A conflict between what Qwen read and what code reads is asked back, never resolved by guessing.
    const analyst = read.clarification
      ? { output: { ...templateAnalysis(result, evidence, constraints, b.previous), clarification: read.clarification, recommendation: null }, producedBy: "template" as const, violations: [] }
      : await runAnalyst({ result, evidence, turns: b.turns ?? [], constraints, previous: b.previous, mode: b.analyst });

    // The model took seconds; a live book did not wait. Price the order again and withdraw the route if it moved.
    let answerCheck: AnswerCheck | undefined;
    if (!book.historical) {
      const fresh = await bookFor("live", order.symbol);
      const again = price(fresh.capture, new Date());
      answerCheck = answerTimeCheck(result, again);
      result = again; capture = fresh.capture;
      if (answerCheck.status === "moved") {
        // One neutral answer: nothing written against the old book survives next to the new one.
        const moved = `The Bitget book moved while this answer was being written: ${answerCheck.reasons.join("; ")}. Nothing is recommended on the old book; re-sound to price it again.`;
        analyst.output = { ...analyst.output, recommendation: null, admissible: [], excluded: [], clarification: null, bindingConstraint: moved, explanation: moved, changedBecause: null };
      } else {
        // It stands, but every number shown must be the fresh book's: an answer that no longer checks out is rebuilt on it.
        const again2 = validate(analyst.output, result, evidence, constraints, replyLanguage(lastUser));
        if (again2.length) analyst.output = templateAnalysis(result, evidence, constraints, b.previous);
      }
    }
    // A decision is actionable only with no question open and no withdrawn answer.
    const actionable = !analyst.output.clarification && answerCheck?.status !== "moved";
    return NextResponse.json({ ...base, result, levels: levelsOf(capture), capture, evidence, analyst, answerCheck, actionable });
  } catch (e) {
    if (e instanceof LiveMetadataUnavailable) return NextResponse.json({ error: `live Bitget metadata unavailable (${e.message}); nothing is priced on recorded rules` }, { status: 503 });
    const j = errorJson(e);
    if (j) return NextResponse.json(j.body, { status: j.status });
    throw e;
  }
}
