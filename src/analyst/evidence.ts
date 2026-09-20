import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { EvidencePack } from "./schema";

const MCP = "https://agent.bitget.com/mcp";

async function mcpCall(method: string, params: unknown, session?: string): Promise<{ body: unknown; session?: string }> {
  const r = await fetch(MCP, {
    method: "POST", signal: AbortSignal.timeout(6000),
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...(session ? { "mcp-session-id": session } : {}) },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
  });
  if (!r.ok) throw new Error(`mcp ${method} ${r.status}`);
  const sid = r.headers.get("mcp-session-id") ?? session;
  const text = await r.text();
  const m = text.match(/data: (\{.*\})/);
  return { body: m ? JSON.parse(m[1]) : JSON.parse(text), session: sid ?? undefined };
}

/** Bitget stock MCP earnings calendar for the issuer. Intermittent in practice; failures return null, never a guess. */
async function liveEvidence(symbol: string, code: string): Promise<EvidencePack | null> {
  try {
    const init = await mcpCall("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "sounding", version: "0.1" } });
    await mcpCall("notifications/initialized", {}, init.session);
    const res = await mcpCall("tools/call", { name: "do_query", arguments: { id: "equity_calendar_earnings", params: { symbol: code } } }, init.session);
    const content = (res.body as { result?: { content?: { text?: string }[] } }).result?.content?.[0]?.text;
    if (!content) return null;
    const parsed = JSON.parse(content) as unknown;
    const rows = Array.isArray(parsed) ? parsed : (parsed as { data?: unknown[] }).data ?? [];
    const records = (rows as Record<string, unknown>[]).slice(0, 5).map((row, i) => ({
      id: `mcp-earnings-${code}-${i}`, issuer: code, kind: "earnings_calendar", title: `Earnings calendar entry ${i + 1}`,
      effective_date_ny: (row.date as string) ?? null, time_ny: (row.time as string) ?? null, time_known: Boolean(row.time),
      source_url: "https://agent.bitget.com/mcp#equity_calendar_earnings", source_type: "Bitget stock MCP", retrieved_utc: new Date().toISOString(), note: JSON.stringify(row).slice(0, 300),
    }));
    return { symbol, code, issuer: code, source_kind: "live_mcp", records };
  } catch {
    return null;
  }
}

export async function evidenceFor(symbol: string, code: string, mode: "recorded" | "live"): Promise<EvidencePack> {
  const path = join(process.cwd(), "fixtures", "evidence", `${symbol}.json`);
  const recorded: EvidencePack | null = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
  if (mode === "live") {
    const live = await liveEvidence(symbol, code);
    if (live && live.records.length) return recorded ? { ...live, records: [...live.records, ...recorded.records] } : live;
  }
  return recorded ?? { symbol, code, issuer: code, source_kind: "unavailable", records: [] };
}
