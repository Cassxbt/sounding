---
name: sounding-precheck
description: Use before placing any Bitget rToken (tokenized US stock, symbol R…USDT) order through Bitget Agent Hub. Checks what the order costs at its full size on the live book, against the trader's own ceiling and fee, and supplies the only order arguments to send. 下单前按真实数量检查 rToken 订单的全部成本。
---

# Sounding pre-check for rToken orders

Agent Hub's flow is `get_auth_status → discover → dryRun → 主网确认卡 → 用户确认 → 执行`. The confirmation card names pair, side, quantity and account, but not what the size costs. This skill adds that, between the dry run and the card.

## When

Any order on an rToken (`R…USDT`, `isReality = yes`) the trader asks for in words: "sell 178 rHIMS, keep it under 0.3%".

## Steps

1. Read the trader's limits from their words: size, ceiling (all-in, bps), fee if they say it. Do not fill a ceiling they did not give: ask.
2. Call `sounding_prepare_order` with `symbol`, `side`, `amount` (buy: USDT, sell: shares), `ceilingBps`, and `userFeeBps` if stated.
3. If `preparation.status` is `refused`:
   - Show `reason`. Do not place any order.
   - If there is a `proposal`, offer it as a new, smaller order with its `remainder` left unpriced. Prepare it again only if the trader chooses it.
4. If `prepared`:
   - Run the Agent Hub `order` tool with exactly `preparation.order` and `--dry-run` (the same command is in `preparation.command`). Change nothing.
   - Add one line to the 确认卡: `Sounding: {binding.allInBps} bps all-in at {binding.fee.bps} bps ({binding.fee.source}), within {binding.ceilingBps} bps · receipt {binding.receipt_sha256 first 12}`.
5. After the trader confirms, call `sounding_verify_order` with `order`, `binding`, `signature`. Send only if it returns `ok: true`. If it is older than two minutes, start again at step 2.

## Never

- Never send an order Sounding refused, or one that differs from `preparation.order`.
- Never present a refused order's cost as acceptable, or a proposal's remainder as filled.
- Nothing here promises a fill: the answer holds for the book it read.
