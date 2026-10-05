// At-size market atlas sampler. Schedule: evidence/atlas-202610/SCHEDULE.md. Raw only; analysis is separate.
import { writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { hostname } from "node:os";
import { gzipSync } from "node:zlib";

const BASE = "https://api.bitget.com";
const OUT = new URL("../evidence/atlas-202610/raw/", import.meta.url);
const END = Date.parse("2026-10-08T12:00:00Z");
const EVERY_MS = 30 * 60_000;
const FLIP_NAMES = 12;
const FLIP_OFFSETS_S = [5, 15, 30];
mkdirSync(OUT, { recursive: true });

async function get(path) {
  const t0 = Date.now();
  try {
    const r = await fetch(BASE + path, { signal: AbortSignal.timeout(20_000) });
    const body = await r.json();
    return { path, status: r.status, request_ms: t0, rtt_ms: Date.now() - t0, body };
  } catch (e) {
    return { path, status: 0, request_ms: t0, rtt_ms: Date.now() - t0, error: String(e) };
  }
}
const book = (s) => get(`/api/v2/spot/market/orderbook?symbol=${s}&limit=150`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function round(i) {
  const started = new Date().toISOString();
  const [stockInfo, states, calendar, instruments] = await Promise.all([
    get("/api/v3/reality/market/stock-info"), get("/api/v3/reality/market/states"),
    get("/api/v3/reality/market/calendar"), get("/api/v3/market/instruments?category=SPOT"),
  ]);
  const eligible = (stockInfo.body?.data ?? []).filter((x) => x.weekendTradable === "yes").map((x) => x.symbol).sort();
  const reality = new Set((stockInfo.body?.data ?? []).map((x) => x.symbol));
  const rules = (instruments.body?.data ?? []).filter((x) => reality.has(x.symbol));
  const books = [];
  for (const s of eligible) books.push({ symbol: s, ...(await book(s)) });
  const flipNames = eligible.length ? Array.from({ length: FLIP_NAMES }, (_, k) => eligible[(i * FLIP_NAMES + k) % eligible.length]) : [];
  const flips = [];
  const firstAt = Date.now();
  for (const off of FLIP_OFFSETS_S) {
    await sleep(Math.max(0, firstAt + off * 1000 - Date.now()));
    for (const s of flipNames) flips.push({ symbol: s, offset_s: off, ...(await book(s)) });
  }
  const rec = { version: "atlas-raw/1.0", host: process.env.ATLAS_HOST ?? hostname(), round: i, started_utc: started, finished_utc: new Date().toISOString(), eligible, stockInfo, states, calendar, instruments: { ...instruments, body: { data: rules } }, books, flip: { names: flipNames, offsets_s: FLIP_OFFSETS_S, books: flips } };
  const name = `round-${String(i).padStart(4, "0")}-${started.replace(/[:.]/g, "")}.json.gz`;
  writeFileSync(new URL(name, OUT), gzipSync(JSON.stringify(rec)));
  const failed = books.filter((b) => b.status !== 200).length;
  console.log(`${started} round ${i}: ${eligible.length} eligible, ${failed} failed books, ${flips.length} flip captures -> ${name}`);
}

// Continue after the highest round on disk, so a restart never reuses a round number.
const done = readdirSync(OUT).map((f) => Number(f.match(/^round-(\d+)-/)?.[1])).filter(Number.isFinite);
for (let i = Math.max(Number(process.argv[2] ?? 0), ...done.map((n) => n + 1)); Date.now() < END; i++) {
  const t = Date.now();
  await round(i);
  await sleep(Math.max(0, t + EVERY_MS - Date.now()));
}
