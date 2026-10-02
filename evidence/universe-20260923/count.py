"""Recount from the saved raw response: python3 count.py stock-info-raw.json"""
import json, sys, hashlib
raw = open(sys.argv[1], 'rb').read(); d = json.loads(raw)['data']
print(hashlib.sha256(raw).hexdigest(), len(d), sum(1 for x in d if x.get('weekendTradable') == 'yes'))
