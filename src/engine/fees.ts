/**
 * Taker fees when the trader has not said theirs. Bitget publishes 0.05% for rTokens at VIP 0-4 under a promotion
 * extended on 2026-09-01 (higher tiers and BGB deduction pay less); 0.10% is the list rate before that promotion.
 * The higher one decides until the trader's own fee is known, and a verdict that differs between them is asked.
 */
export const DEFAULT_FEE_SCENARIOS_BPS = [5, 10];
export const FEE_SCENARIO_SOURCES: Record<number, string> = {
  5: "Bitget's published rToken taker rate (VIP 0-4, promotion extended 2026-09-01)",
  10: "the rToken list rate before that promotion",
};
