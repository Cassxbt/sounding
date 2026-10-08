# Source parity + weekend order types — evidence (2026-09-20, Sunday, weekend MM session)

## Source parity: Bitget web UI order book vs public spot API
- Instrument: RHOODUSDT (rHOOD/USDT, badge "US-Stock"), weekendTradable=yes.
- UI screenshot: `parity-rhood-ui-092559Z.jpg` (captured 09:25:59 UTC).
- API capture: `parity-rhood-api-092559.json`, exchange ts 1789896360407 (09:26:00.407 UTC), `GET /api/v2/spot/market/orderbook?symbol=RHOODUSDT&limit=5`.

| Side | UI (price / qty) | API (price / qty) | Match |
|---|---|---|---|
| Ask 5 | 117.41 / 4.8480 | 117.41 / 4.848 | yes |
| Ask 4 | 117.39 / 5.3280 | 117.39 / 5.328 | yes |
| Ask 3 | 117.38 / 5.1120 | 117.38 / 5.112 | yes |
| Ask 2 | 117.36 / 1.8081 | 117.36 / 1.8081 | yes |
| Ask 1 | 117.33 / 1.9200 | 117.33 / 1.92 | yes |
| Bid 1 | 117.27 / 5.3760 | 117.27 / 5.376 | yes |
| Bid 2 | 117.26 / 5.7600 | 117.26 / 5.76 | yes |
| Bid 3 | 117.25 / 2.4000 | 117.25 / 2.4 | yes |
| Bid 4 | 117.23 / 1.8479 | 117.23 / 1.8479 | yes |
| Bid 5 | 117.20 / 2.0400 | 117.2 / 2.04 | yes |

Conclusion: the book a retail user sees and trades against in the Bitget UI is the public spot book, level for level, at this instant. The separately documented whitelisted Reality depth feed was not compared (no access); the product labels its source as "public spot book (matches Bitget UI, verified 2026-09-20)". One instrument, one instant; repeat on 2–3 more names before submission.

## Weekend order types offered in the UI
- Screenshot: `weekend-order-types-rhood-092620Z.jpg`. Order-type sheet on the rHOOD/USDT spot form, Sunday, shows **Limit order** and **Market order**.
- Not tested: whether a market order submitted on the weekend is accepted/filled (requires a funded account). The Stock 2.0 FAQ lists limit/TP/SL for weekends; the UI additionally exposes Market. Product wording: "immediate book-crossing cost (market or marketable-limit)"; no fill promised.
