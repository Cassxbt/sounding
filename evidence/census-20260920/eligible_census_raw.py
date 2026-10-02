"""Eligible-universe census with RAW levels, per-symbol timing, and separate buy-budget / sell-shares solvers.
Replay: python3 eligible_census_raw.py --replay <file>  (recomputes every aggregate from stored raw books, no network)."""
import json, sys, time, datetime, urllib.request, statistics, hashlib
from decimal import Decimal as D, ROUND_DOWN
VERSION = "census-raw/1.0"
SIZES = [1000, 5000, 25000]
THIN_MIN_FRAC = D('0.25'); THIN_GAP_BPS = D(3); THIN_PENALTY_BPS = D(2)   # display thresholds, not safety thresholds

def get(u):
    t0 = time.monotonic()
    with urllib.request.urlopen(u, timeout=25) as r: d = json.load(r)
    return d, int((time.monotonic() - t0) * 1000)

def buy_with_budget(asks, budget):
    """Spend up to `budget` quote walking asks. Returns (shares, spent, exhausted)."""
    rem, shares = D(budget), D(0)
    for p, s in asks:
        p, s = D(p), D(s); lvl = p * s
        if lvl >= rem: shares += rem / p; rem = D(0); break
        shares += s; rem -= lvl
    return shares, D(budget) - rem, rem > 0

def sell_shares(bids, qty):
    """Sell `qty` base walking bids. Returns (proceeds, unsold)."""
    rem, cash = D(qty), D(0)
    for p, s in bids:
        take = min(rem, D(s)); cash += take * D(p); rem -= take
        if rem == 0: break
    return cash, rem

def analyze(book, size):
    asks, bids = book['asks'], book['bids']
    a0, b0 = D(asks[0][0]), D(bids[0][0]); mid = (a0 + b0) / 2
    out = {'size_usdt': size}
    sh, spent, exhausted = buy_with_budget(asks, size)
    if exhausted or sh == 0: out['buy'] = {'status': 'INSUFFICIENT_VISIBLE_DEPTH'}
    else:
        vwap = spent / sh
        out['buy'] = {'status': 'OK', 'shares': float(sh), 'spent': float(spent), 'vwap': float(vwap), 'bps_vs_mid': round(float((vwap - mid) / mid * 10000), 2)}
    qty = (D(size) / mid)
    proceeds, unsold = sell_shares(bids, qty)
    if unsold > 0: out['sell'] = {'status': 'INSUFFICIENT_VISIBLE_DEPTH'}
    else:
        vwap = proceeds / qty
        out['sell'] = {'status': 'OK', 'shares': float(qty), 'proceeds': float(proceeds), 'vwap': float(vwap), 'bps_vs_mid': round(float((mid - vwap) / mid * 10000), 2)}
    # thin-top flag on the buy side, size-relative
    q_req = D(size) / a0; q0 = D(asks[0][1])
    gap = (D(asks[1][0]) - a0) / a0 * 10000 if len(asks) > 1 else D(0)
    pen = D(str(out['buy'].get('bps_vs_mid', 0))) - (a0 - mid) / mid * 10000 if out['buy']['status'] == 'OK' else D(0)
    out['thin_top'] = bool(q0 < THIN_MIN_FRAC * q_req and gap >= THIN_GAP_BPS and pen >= THIN_PENALTY_BPS)
    return out

def aggregate(rows):
    ok = [r for r in rows if r.get('analysis')]
    agg = {'n_with_book': len(ok), 'displayed_spread_bps_median': statistics.median(r['spread_bps'] for r in ok)}
    for i, s in enumerate(SIZES):
        for side in ('buy', 'sell'):
            v = [r['analysis'][i][side]['bps_vs_mid'] for r in ok if r['analysis'][i][side]['status'] == 'OK']
            agg[f'{side}_{s}'] = {'n': len(v), 'insufficient': len(ok) - len(v), 'median_bps_pre_fee': round(statistics.median(v), 2), 'p75': round(sorted(v)[3 * len(v) // 4], 2), 'over_25': sum(1 for x in v if x > 25), 'over_50': sum(1 for x in v if x > 50)}
        agg[f'thin_top_{s}'] = sum(1 for r in ok if r['analysis'][i]['thin_top'])
    return agg

def capture(out_path):
    info, _ = get('https://api.bitget.com/api/v3/reality/market/stock-info')
    elig = [x for x in info['data'] if x.get('weekendTradable') == 'yes']
    rows = []
    for x in elig:
        s = x['symbol']; t_start = datetime.datetime.now(datetime.UTC).isoformat(timespec='milliseconds')
        try:
            resp, ms = get(f'https://api.bitget.com/api/v2/spot/market/orderbook?symbol={s}&limit=150')
        except Exception as e:
            rows.append({'symbol': s, 'error': repr(e)}); continue
        b = resp['data']; raw = json.dumps(resp, sort_keys=True, separators=(',', ':'))
        row = {'symbol': s, 'code': x.get('code'), 'request_start_utc': t_start, 'rtt_ms': ms, 'exchange_ts': b.get('ts'), 'server_requestTime': resp.get('requestTime'),
               'raw_sha256': hashlib.sha256(raw.encode()).hexdigest(), 'raw': resp}
        if b['asks'] and b['bids'] and D(b['bids'][0][0]) < D(b['asks'][0][0]):
            a0, b0 = D(b['asks'][0][0]), D(b['bids'][0][0]); row['spread_bps'] = round(float((a0 - b0) / ((a0 + b0) / 2) * 10000), 2)
            row['analysis'] = [analyze(b, s_) for s_ in SIZES]
        else: row['status'] = 'INVALID_BOOK'
        rows.append(row); time.sleep(0.08)
    out = {'version': VERSION, 'captured_utc': datetime.datetime.now(datetime.UTC).isoformat(timespec='seconds'), 'source': 'public spot orderbook v2 limit=150 (NOT the whitelisted Reality depth feed)',
           'eligible_universe': [x['symbol'] for x in elig], 'stock_info_count': len(info['data']), 'rows': rows, 'aggregate': aggregate(rows)}
    json.dump(out, open(out_path, 'w'))
    return out

def replay(path):
    d = json.load(open(path)); rows = []
    for r in d['rows']:
        if 'raw' not in r: rows.append(r); continue
        raw = json.dumps(r['raw'], sort_keys=True, separators=(',', ':'))
        assert hashlib.sha256(raw.encode()).hexdigest() == r['raw_sha256'], r['symbol']
        b = r['raw']['data']; rr = {'symbol': r['symbol'], 'spread_bps': r.get('spread_bps')}
        if 'analysis' in r: rr['analysis'] = [analyze(b, s) for s in SIZES]
        rows.append(rr)
    return aggregate(rows)

if __name__ == '__main__':
    if sys.argv[1] == '--replay': print(json.dumps(replay(sys.argv[2]), indent=1))
    else: print(json.dumps(capture(sys.argv[1])['aggregate'], indent=1))
