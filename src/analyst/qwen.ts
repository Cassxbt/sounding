import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { AnalystOutputSchema, type AnalystOutput } from "./schema";

/** Bitget-provided Qwen endpoint for Hackathon S2 (OpenAI-compatible). Key via BITGET_QWEN_API_KEY. */
export const QWEN = {
  baseUrl: process.env.BITGET_QWEN_BASE_URL ?? "https://hackathon.bitgetops.com/v1",
  model: process.env.BITGET_QWEN_MODEL ?? "qwen3.8-max",
};
// Serverless filesystems are read-only outside /tmp; locally the log lives in ./data.
const LOG_DIR = process.env.VERCEL ? "/tmp" : join(process.cwd(), "data");
export const USAGE_LOG = join(LOG_DIR, "qwen-usage.jsonl");

export function qwenAvailable(): boolean { return Boolean(process.env.BITGET_QWEN_API_KEY); }

export interface QwenUsage { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }

/** Every call appends one line: when, what for, tokens, latency, outcome. No prompt text, no key. */
export function logUsage(entry: { purpose: string; usage?: QwenUsage; ms: number; status: number | string; model: string }) {
  try {
    mkdirSync(LOG_DIR, { recursive: true });
    appendFileSync(USAGE_LOG, JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n");
  } catch { /* logging must never break a request */ }
}

/** A filled example beats a schema: Qwen echoes schemas back. Values are placeholders the model must replace. */
const EXAMPLE_OUTPUT = {
  constraints: { thesis: "string or null", hardDeadlineNy: "YYYY-MM-DD or null", mustBeFlat: false, exclusiveExposure: false, proxyConsent: false, takerFeeBps: null },
  clarification: "one question, or null",
  admissible: [{ kind: "requote_at_switch", reason: "why it fits, <=240 chars" }],
  excluded: [{ kind: "resting_limit", reason: "why it is out, <=240 chars" }],
  recommendation: "one of immediate_cross | largest_within_ceiling | resting_limit | requote_at_switch, or null",
  bindingConstraint: "<=240 chars",
  evidence: [{ recordId: "id from the evidence pack", relevant: true, reason: "<=240 chars" }],
  changedBecause: "string or null",
  explanation: "<=120 words; cite record ids and only engine numbers",
};
const OUTPUT_INSTRUCTIONS = `Respond with ONLY a JSON object with exactly these keys and value types (replace every placeholder; do not output a schema):
${JSON.stringify(EXAMPLE_OUTPUT, null, 1)}
"kind" and "recommendation" values must be one of: immediate_cross, largest_within_ceiling, resting_limit, requote_at_switch. Use null where the example says "or null".`;

/** One JSON-mode chat call to the Bitget Qwen endpoint. Logs usage; throws on network/HTTP failure. */
export async function qwenJson(system: string, user: string, purpose: string, timeoutMs: number): Promise<{ json: unknown; raw: string; usage?: QwenUsage }> {
  const key = process.env.BITGET_QWEN_API_KEY;
  if (!key) throw new Error("BITGET_QWEN_API_KEY not set");
  const body = {
    model: QWEN.model, temperature: 0, response_format: { type: "json_object" },
    // Bitget's gateway times out at ~120 s and qwen3.8-max thinking on this prompt exceeds it; thinking off answers in ~15 s.
    enable_thinking: process.env.BITGET_QWEN_THINKING === "on",
    messages: [{ role: "system", content: system }, { role: "user", content: user }],
  };
  const t0 = Date.now();
  let r: Response;
  try {
    r = await fetch(`${QWEN.baseUrl}/chat/completions`, { method: "POST", signal: AbortSignal.timeout(timeoutMs), headers: { "content-type": "application/json", authorization: `Bearer ${key}` }, body: JSON.stringify(body) });
  } catch (e) { logUsage({ purpose, ms: Date.now() - t0, status: "network", model: QWEN.model }); throw e; }
  if (!r.ok) { logUsage({ purpose, ms: Date.now() - t0, status: r.status, model: QWEN.model }); throw new Error(`qwen ${r.status}: ${(await r.text()).slice(0, 300)}`); }
  const j = (await r.json()) as { choices?: { message?: { content?: string } }[]; usage?: QwenUsage; model?: string };
  logUsage({ purpose, usage: j.usage, ms: Date.now() - t0, status: r.status, model: j.model ?? QWEN.model });
  const raw = j.choices?.[0]?.message?.content ?? "";
  try { return { json: JSON.parse(raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, "")), raw, usage: j.usage }; }
  catch { return { json: null, raw, usage: j.usage }; }
}

// Both calls share one 60 s serverless budget: intake ~20 s, analysis ~30 s, engine and I/O the rest.
export const INTAKE_TIMEOUT_MS = 20_000;
export const ANALYST_TIMEOUT_MS = 30_000;

export async function qwenAnalyze(system: string, user: string, purpose = "analyst"): Promise<{ parsed: AnalystOutput | null; raw: string; usage?: QwenUsage }> {
  const { json, raw, usage } = await qwenJson(`${system}\n\n${OUTPUT_INSTRUCTIONS}`, user, purpose, ANALYST_TIMEOUT_MS);
  const parsed = json ? AnalystOutputSchema.safeParse(json) : null;
  return { parsed: parsed?.success ? parsed.data : null, raw, usage };
}
