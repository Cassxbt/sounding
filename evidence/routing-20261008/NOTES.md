# Which book fills: weekday routing, sampled 2026-10-08 04:18-04:22Z (Thursday, US overnight session)

Bitget's support article "What Is Bitget US Stock 2.0" (2026-08-28, https://www.bitget.com/support/articles/12560603893695) and its rToken fee article (12560603891318) describe two venues. In US sessions (pre-market, regular, after-hours, overnight) rToken orders are routed to NASDAQ/NYSE. On weekends and US holidays Bitget matches them on its own book, with market makers (Saturday 08:00 to Monday 08:00 UTC+8 while US daylight time runs, Friday 20:00 to Sunday 20:00 New York either way).

`sample.mjs` read the ticker and the public order book for each of the 90 weekend-tradable rTokens, three passes a minute apart (`node sample.mjs`; no key). Of 270 samples:

- the ticker's top ask size was a whole number of shares in all 270, as on a US exchange; the book's top ask size was fractional in 269;
- the ticker's best ask was better than the book's in 252, while its best bid was worse than the book's in 200: the two quotes do not come from one book;
- the ticker's top size was more than twice the book's top size in 195, and larger than the book's whole visible ask side in 20.

The two public feeds disagree at that hour. That does not by itself identify which venue fills an order; Bitget's published routing does, and Sounding's scope (weekends and US holidays only) is the conservative reading of it. Sounding therefore prices orders only in weekend and holiday sessions, where the book it walks is the one the order fills against, and refuses the rest with `ROUTED_TO_US_MARKET` (engine 0.6.0).
