# Whole-task eval · held-out · run once at 62fe672, published unchanged

30 complete tasks (15 EN, 10 ZH, 5 mixed; 19 answer, 8 ask, 3 no-book), written by a blind agent that read neither the code nor earlier sets. Each task starts from desk controls, runs 1 to 3 chat turns through the real analyst route, and is scored by `scripts/wholetask-eval.ts` with rules fixed before the set was read.

| arm | complete | safe abstain | critical |
|---|---|---|---|
| regex reader + deterministic template | 11/30 | 8 | 11 |
| Qwen checked intake + analyst | 24/30 | 3 | 3 |

The three critical errors on the Qwen arm:
- W07, W24: one message named two instruments ("1,000 USDT into rSPY and 1,000 into rSPMO"; "买 rSPY 和 rHIMS 各 500 USDT"). Qwen read one of them and code confirmed that quote without checking the rest of the message; a cross was recommended for one of the two.
- W11: two contradictory fees in one sentence ("6 bps, which is 0.1%"); code confirmed the quoted "6 bps" and did not notice the second figure.

The three safe abstentions were questions the trader did not need: "keep it under the ceiling", "ceiling 照旧" (as before) and "含手续费" (including fees) name a limit without stating one.

Fixes informed by this run come after it; any later run of this set is a development run.

## Development re-run at 05288cc (after fixes informed by this set and by stress tests; not held-out)

Qwen arm 30/30 complete, 0 critical, 0 needless questions; baseline 13/30, 11 critical. The same commit on the paraphrase sets: v2 147/151 and v1 135/138 stated limits, 0 wrong values on both. The fixes are general rules (two instruments named, two figures for one limit, a cost limit stated but not read, someone else's fee), each with tests; this set was not tuned against beyond them.
