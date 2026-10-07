#!/usr/bin/env node
// Sounding as an MCP tool beside Bitget Agent Hub (bitget-agent-mcp). Stdio, newline-delimited JSON-RPC, no dependencies.
// Run: SOUNDING_URL=https://sounding-zeta.vercel.app node agent/sounding-mcp.mjs
import { createInterface } from "node:readline";

const BASE = (process.env.SOUNDING_URL ?? "https://sounding-zeta.vercel.app").replace(/\/$/, "");
const TOOLS = [
  {
    name: "sounding_prepare_order",
    description: "Before any Bitget rToken order: walks the live Bitget book at this exact size and returns the Agent Hub `order` arguments only if the all-in cost fits the trader's ceiling at their fee. Otherwise returns why not and, when one exists, the largest size that fits as a new choice. Send only the returned order.",
    inputSchema: {
      type: "object",
      required: ["symbol", "side", "amount", "ceilingBps"],
      properties: {
        symbol: { type: "string", description: "Bitget rToken symbol, e.g. RHIMSUSDT" },
        side: { type: "string", enum: ["buy", "sell"] },
        amount: { type: "string", description: "buy: USDT to spend; sell: shares" },
        ceilingBps: { type: "number", description: "the most the trader accepts, all-in, in basis points" },
        userFeeBps: { type: "number", description: "the trader's taker fee in bps, if they stated it" },
      },
    },
  },
  {
    name: "sounding_verify_order",
    description: "Right before sending: confirms the order is exactly the one Sounding prepared, issued by Sounding, and under two minutes old.",
    inputSchema: { type: "object", required: ["order", "binding"], properties: { order: { type: "object" }, binding: { type: "object" }, signature: { type: "string" } } },
  },
];

async function call(name, args) {
  const body = name === "sounding_verify_order" ? { verify: args } : { ...args, mode: "live" };
  const r = await fetch(`${BASE}/api/prepare`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) });
  return { content: [{ type: "text", text: JSON.stringify(await r.json(), null, 1) }], isError: !r.ok };
}

const send = (m) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...m }) + "\n");
createInterface({ input: process.stdin }).on("line", async (line) => {
  let m;
  try { m = JSON.parse(line); } catch { return; }
  if (m.id === undefined) return;
  try {
    if (m.method === "initialize") send({ id: m.id, result: { protocolVersion: m.params?.protocolVersion ?? "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "sounding", version: "0.5.0" } } });
    else if (m.method === "tools/list") send({ id: m.id, result: { tools: TOOLS } });
    else if (m.method === "tools/call") send({ id: m.id, result: await call(m.params.name, m.params.arguments ?? {}) });
    else if (m.method === "ping") send({ id: m.id, result: {} });
    else send({ id: m.id, error: { code: -32601, message: `unknown method ${m.method}` } });
  } catch (e) {
    send({ id: m.id, result: { content: [{ type: "text", text: String(e) }], isError: true } });
  }
});
