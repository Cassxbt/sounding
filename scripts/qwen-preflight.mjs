// One tiny call to prove the Bitget Qwen credit endpoint + key work. Prints usage; never prints the key.
import { readFileSync, existsSync } from "node:fs";
if (existsSync(".env.local")) for (const l of readFileSync(".env.local", "utf8").split("\n")) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim(); }
const key = process.env.BITGET_QWEN_API_KEY; if (!key) { console.error("BITGET_QWEN_API_KEY missing in .env.local"); process.exit(2); }
const base = process.env.BITGET_QWEN_BASE_URL ?? "https://hackathon.bitgetops.com/v1"; const model = process.env.BITGET_QWEN_MODEL ?? "qwen3.8-max";
const t0 = Date.now();
const r = await fetch(`${base}/chat/completions`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
  body: JSON.stringify({ model, messages: [{ role: "user", content: "Reply with the single word: sounding" }], max_tokens: 8, temperature: 0 }) });
const text = await r.text();
console.log("HTTP", r.status, `${Date.now() - t0} ms`);
try { const j = JSON.parse(text); console.log("model:", j.model, "| reply:", j.choices?.[0]?.message?.content, "| usage:", JSON.stringify(j.usage)); } catch { console.log(text.slice(0, 400)); }
