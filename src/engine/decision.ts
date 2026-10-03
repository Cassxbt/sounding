import type { FeeScenario, SoundingResult } from "./types";

/** Cost move between two soundings beyond which a quote is unstable; Last Look uses the same number. */
export const STABILITY_BPS = 10;
export const DEFAULT_LASTLOOK_TOLERANCE_BPS = STABILITY_BPS;
/** A decision older than this is not confirmed on a fresh book; it is re-sounded. */
export const MAX_DECISION_AGE_MS = 120_000;

/** The fee row that decides: the trader's stated fee, otherwise the worst scenario (a decision must hold at every unknown fee). */
export function decidingRow(r: SoundingResult): FeeScenario | undefined {
  const fees = r.fees ?? [];
  return fees.find((f) => f.source === "user") ?? fees.filter((f) => f.source === "scenario").sort((a, b) => b.feeBps - a.feeBps)[0];
}
