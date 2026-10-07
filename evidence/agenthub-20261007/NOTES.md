# Agent Hub order path, recorded 2026-10-07

Same three orders on rHIMS, live Bitget book, no keys used for the CLI.

- `bgc-dry-run.jsonl`: Bitget Agent Hub CLI `@bitget-ai/bitget-agent-cli` 3.0.0, `bgc order --action place ... --dry-run`. Every one returns a `wouldSend`: a 5,000-share market sell the visible book cannot fill, `side=hold qty=-5`, and a 50-share sell. The dry run previews what it is told; it does not check size, side or cost.
- `sounding-prepare.txt`: Sounding's `/api/prepare` on the same orders with a 40 bps ceiling. The 5,000-share sell is refused (the book cannot fill it) with 578.4334 shares offered as a new order; `hold`/`-5` is rejected as input; the 50-share sell is prepared (14.62 bps all-in, within 40) as the exact Agent Hub `order` arguments, bound to its receipt, at the account's own 5 bps taker fee read through Agent Hub's read-only client (`getAccountFeeRate`, SDK 3.3.1). The account read used a read-only key on the developer's machine; the public site holds no key and never shows one account's fee as anyone else's.
- Reproduce: `bgc order --action place --category SPOT --symbol RHIMSUSDT --side sell --orderType market --qty 5000 --dry-run`, and `POST /api/prepare {"symbol":"RHIMSUSDT","side":"sell","amount":"5000","ceilingBps":40,"mode":"live"}`. Live books move; the shape of the answer, not the exact figures, is what repeats.
