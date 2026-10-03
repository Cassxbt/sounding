import { z } from "zod";

export const ConstraintsSchema = z.object({
  thesis: z.string().nullable().describe("The trader's stated reason for holding or wanting exposure, verbatim or close"),
  hardDeadlineNy: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().describe("YYYY-MM-DD in America/New_York by which the position must be flat/filled, if stated as hard"),
  mustBeFlat: z.boolean().describe("true if the trader said they must be out (or in) by the deadline, not merely prefer"),
  exclusiveExposure: z.boolean().describe("true if the trader only wants this specific company/index, so proxies are excluded"),
  proxyConsent: z.boolean().describe("true only if the trader explicitly consented to substitute exposure"),
  takerFeeBps: z.number().nullable().describe("the trader's actual taker fee in bps if they stated it"),
});
export type Constraints = z.infer<typeof ConstraintsSchema>;

export const AltKind = z.enum(["immediate_cross", "largest_within_ceiling", "resting_limit", "requote_at_switch"]);

export const EvidenceUseSchema = z.object({
  recordId: z.string(),
  relevant: z.boolean(),
  reason: z.string().max(240),
});

export const AnalystOutputSchema = z.object({
  constraints: ConstraintsSchema,
  clarification: z.string().nullable().describe("At most one question, only if a missing constraint changes the recommendation"),
  admissible: z.array(z.object({ kind: AltKind, reason: z.string().max(240) })),
  excluded: z.array(z.object({ kind: AltKind, reason: z.string().max(240) })),
  recommendation: AltKind.nullable().describe("null when no alternative satisfies every hard constraint"),
  bindingConstraint: z.string().max(240),
  evidence: z.array(EvidenceUseSchema),
  changedBecause: z.string().nullable().describe("If this is a follow-up turn, why the recommendation changed or stayed"),
  explanation: z.string().max(700).describe("Under 120 words. Cite record ids and the engine numbers; never invent numbers"),
});
export type AnalystOutput = z.infer<typeof AnalystOutputSchema>;

export interface EvidenceRecord {
  id: string; issuer: string; kind: string; title: string;
  effective_date_ny: string | null; time_ny: string | null; time_known: boolean;
  source_url: string; source_type: string; retrieved_utc: string; note?: string;
}
export interface EvidencePack { symbol: string; code: string; issuer: string; source_kind: "live_mcp" | "recorded_first_party" | "unavailable"; recorded_utc?: string; records: EvidenceRecord[] }
