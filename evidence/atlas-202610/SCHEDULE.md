# At-size market atlas: sampling schedule (declared 2026-10-04, before any data)

Purpose: measure how often a trader's order fits a cost ceiling by the best quote but not at its full size, and how quickly a verdict can change, across Bitget rToken sessions.

- Universe: every rToken Bitget's stock-info flags `weekendTradable = yes` at the start of each round (90 on 2026-10-04).
- Cadence: one round every 30 minutes from the first run until 2026-10-08 12:00 UTC, covering weekend, overnight, pre-market, regular and post-market sessions.
- Each round captures, in raw form: stock-info, market states, calendar, spot instrument rules, and `GET /api/v2/spot/market/orderbook?limit=150` for every eligible symbol, with request time, response time and exchange timestamp.
- Flip timing: each round re-captures 12 names (rotating through the universe) at +5 s, +15 s and +30 s after their first capture.
- Failures are recorded as failures, with the error; nothing is dropped or retried silently. Missed rounds (machine asleep, network) stay missing.
- Analysis (fixed now): for buy budgets of 1,000 / 5,000 / 25,000 USDT and sells of the same notional, at fees of 8, 10 and 20 bps and ceilings of 30 and 50 bps, count snapshots where the best quote is inside the ceiling but the full order is not, and where a verdict changes between a capture and its +5/+15/+30 s re-capture. Denominators are reported per session state. Everything is recomputed from the stored raw books with Sounding's engine.
- What this cannot show: fills, hidden liquidity, behaviour outside the sampled hours, or that one week is typical.
