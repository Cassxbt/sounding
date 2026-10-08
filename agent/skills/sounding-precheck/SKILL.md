---
name: sounding-precheck
description: >
  Use before placing any Bitget rToken order (tokenized US stock, symbol R…USDT,
  isReality = yes) through @bitget-ai/bitget-agent-mcp or bgc, after the dry run and
  before the confirmation card, on weekends and US holidays, when Bitget matches rToken
  orders on its own book. Checks what the order costs at its full size on that
  live book against the trader's own ceiling and fee, and supplies the only order
  arguments to send. Complements Agent Hub's pre_trade_check, which reads the
  ticker price, balance and positions but not the book at the order's size. Triggers: sell/buy an rToken "under 0.3%", "keep costs below",
  "at my fee", 下单前检查成本、按我的数量算成本、不超过千分之三、卖出 rHIMS、买入 rSPY.
  Do NOT use for crypto pairs, futures, or orders the trader sizes by price only.
metadata:
  version: 0.6.0
  author: cassxbt
  updated: 2026-10-08
  requires:
    bins: ["node"]
    node: ">=20"
  packages:
    mcp: "agent/sounding-mcp.mjs"
    pairs-with: "@bitget-ai/bitget-agent-mcp"
license: MIT
---

# Sounding pre-check for rToken orders

Agent Hub's flow is `get_auth_status → discover → dryRun → 主网确认卡 → 用户确认 → 执行`. Its `pre_trade_check` prompt reads the ticker price, the balance and the positions. Nothing in the flow walks the order book at the order's full size, so the confirmation card names pair, side, quantity and account, but not what that size costs. This skill adds it, before the card.

## Install

1. Run the MCP server beside `@bitget-ai/bitget-agent-mcp`. In your MCP client config:
   ```json
   { "mcpServers": { "sounding": { "command": "node", "args": ["/path/to/sounding/agent/sounding-mcp.mjs"], "env": { "SOUNDING_URL": "https://sounding-zeta.vercel.app" } } } }
   ```
2. Copy this folder into your agent's skills directory (for example `~/.claude/skills/sounding-precheck/`), next to Bitget's `bitget-agentic` and `uta` skills.

## When

Any order on an rToken (`R…USDT`, `isReality = yes`) the trader asks for in words, "sell 178 rHIMS, keep it under 0.3%", during a weekend or US-holiday session. Then Bitget matches the order on its own book with market makers, and that book is the one Sounding walks. In US sessions (pre-market, regular, after-hours, overnight) Bitget routes rToken orders to NASDAQ/NYSE, and Sounding refuses with `ROUTED_TO_US_MARKET`.

## Steps

1. Read the trader's limits from their words: size, and ceiling (all-in, bps). Do not fill a ceiling they did not give: ask.
2. Read the trader's own taker fee with Agent Hub: `account_overview({ category: "SPOT", symbol })` returns `feeRate.takerFeeRate`; multiply by 10,000 for bps. If they stated a fee, use theirs.
3. Call `sounding_prepare_order` with `symbol`, `side`, `amount` (buy: USDT, sell: shares), `ceilingBps` and `userFeeBps`.
4. If `preparation.status` is `refused`:
   - If `code` is `ROUTED_TO_US_MARKET`, tell the trader the order goes to the US market this session and Sounding has not priced it. Add no Sounding line to the card; the trader decides.
   - Otherwise show `reason`. Place no order.
   - If there is a `proposal`, offer it as a new, smaller order with its `remainder` left unpriced. Prepare it again only if the trader chooses it.
5. If `prepared`:
   - Preview with Agent Hub's `order` tool using exactly `preparation.order` plus `dryRun: true` (CLI: `preparation.command`). Change nothing.
   - Add one line to the 确认卡: `Sounding: {binding.allInBps} bps all-in at {binding.fee.bps} bps ({binding.fee.source}), within {binding.ceilingBps} bps · receipt {binding.receipt_sha256 first 12}`.
6. After the trader confirms, and immediately before sending:
   - Call `sounding_prepare_order` again with the same inputs. Send only if it is `prepared` and its `binding.order_sha256` equals the one the trader confirmed; otherwise show the new answer and start again.
   - Call `sounding_verify_order` with `order`, `binding`, `signature`. Send only on `ok: true`.

## Never

- Never send an order Sounding refused on the book it walked, or one that differs from `preparation.order`.
- Never present a refused order's cost as acceptable, or a proposal's remainder as filled.
- Nothing here promises a fill: the answer holds for the book it read.
