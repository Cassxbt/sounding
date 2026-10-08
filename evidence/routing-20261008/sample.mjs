// Ticker top-of-book vs public order book, for every weekend-tradable rToken; three passes a minute apart.
const get = async (u) => (await fetch(u, { signal: AbortSignal.timeout(15000) })).json();
const info = (await get("https://api.bitget.com/api/v3/reality/market/stock-info")).data.filter((x) => x.weekendTradable === "yes").map((x) => x.symbol);
const rows = [];
for (let pass = 0; pass < 3; pass++) {
  for (const s of info) {
    try {
      const [t, b] = await Promise.all([get(`https://api.bitget.com/api/v3/market/tickers?category=SPOT&symbol=${s}`), get(`https://api.bitget.com/api/v2/spot/market/orderbook?symbol=${s}&limit=150`)]);
      const tk = t.data?.[0], bk = b.data;
      if (!tk || !bk?.asks?.length || !bk?.bids?.length) { rows.push({ pass, s, missing: true }); continue; }
      const askDepth = bk.asks.reduce((q, [, z]) => q + Number(z), 0), bidDepth = bk.bids.reduce((q, [, z]) => q + Number(z), 0);
      rows.push({ pass, s, tAsk: +tk.ask1Price, tAskSz: +tk.ask1Size, bAsk: +bk.asks[0][0], bAskSz: +bk.asks[0][1], tBid: +tk.bid1Price, tBidSz: +tk.bid1Size, bBid: +bk.bids[0][0], bBidSz: +bk.bids[0][1], askDepth, bidDepth, ts: tk.ts ?? t.requestTime });
    } catch (e) { rows.push({ pass, s, error: String(e) }); }
  }
  if (pass < 2) await new Promise((r) => setTimeout(r, 60000));
}
const fs = await import("node:fs"); fs.writeFileSync("ticker-vs-book-20261008.json", JSON.stringify({ at: new Date().toISOString(), rows }, null, 1));
const ok = rows.filter((r) => r.tAsk);
const better = ok.filter((r) => r.tAsk < r.bAsk).length, bigger = ok.filter((r) => r.tAskSz > r.bAskSz * 2).length, exceedsBook = ok.filter((r) => r.tAskSz > r.askDepth).length;
console.log(JSON.stringify({ samples: ok.length, names: info.length, tickerAskBetterThanBook: better, tickerTopSizeOver2xBookTop: bigger, tickerTopSizeExceedsWholeVisibleAskSide: exceedsBook, missing: rows.filter((r) => r.missing).length }));
