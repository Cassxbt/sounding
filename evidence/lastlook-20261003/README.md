# Saturday rHIMS book, 2026-10-03 01:19:55 → 01:30:06 UTC

30 consecutive public spot books for RHIMSUSDT, 20 s apart (`rhims-sequence-raw.json`, captured by `sample_pairs.py`).

- Every raw response differs only by its timestamp; the top 10 bid and ask levels are identical across all 30 (weekend market-maker quote, US exchanges closed).
- At 178.4121 shares, sell-side cost is 32.42 bps pre-fee on every capture; a Last Look between any two of them stands with zero drift.
- The recorded "stands" demo pairs capture 0 (01:19:55) with capture 1 (01:20:16). The recorded "void" demo confirms a decision read on the 2026-09-20 book against capture 1: the replay of a stale decision.
