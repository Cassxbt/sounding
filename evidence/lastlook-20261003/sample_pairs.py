"""Capture consecutive raw RHIMSUSDT books (public spot v2, limit=150) with hashes and timing.
The Last Look demo pairs are chosen from these real captures; nothing is synthesized."""
import json, sys, time, hashlib, datetime, urllib.request
N, GAP = int(sys.argv[1]), float(sys.argv[2])
out = []
for i in range(N):
    t0 = datetime.datetime.now(datetime.UTC).isoformat(timespec='milliseconds'); m = time.monotonic()
    raw = json.load(urllib.request.urlopen('https://api.bitget.com/api/v2/spot/market/orderbook?symbol=RHIMSUSDT&limit=150', timeout=20))
    rtt = int((time.monotonic() - m) * 1000)
    out.append({'symbol': 'RHIMSUSDT', 'request_start_utc': t0, 'rtt_ms': rtt, 'exchange_ts': raw['data']['ts'], 'server_requestTime': raw.get('requestTime'),
                'raw_sha256': hashlib.sha256(json.dumps(raw, sort_keys=True, separators=(',', ':')).encode()).hexdigest(), 'raw': raw,
                'source': 'public spot orderbook v2 limit=150 (matches Bitget UI, verified 2026-09-20 for RHOODUSDT)'})
    print(i, t0, 'bid', raw['data']['bids'][0], 'ask', raw['data']['asks'][0], flush=True)
    if i < N - 1: time.sleep(GAP)
json.dump(out, open(sys.argv[3], 'w'))
