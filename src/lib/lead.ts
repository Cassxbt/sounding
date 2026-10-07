/** The lead order, as a trader would type it. The desk, the proof and the deletion test all start from these words. */
export const LEAD_TEXT = "Sell 178.4121 rHIMS. I pay 0.05% taker, keep it under 0.3% all-in, and I must be out before the 8th.";
/** The words in LEAD_TEXT that state the fee and the ceiling; code reads each number from them. */
export const LEAD_FEE_WORDS = "I pay 0.05% taker";
export const LEAD_CEILING_WORDS = "keep it under 0.3% all-in";
