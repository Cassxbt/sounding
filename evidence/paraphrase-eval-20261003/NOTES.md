# Paraphrase eval v1 · 2026-10-03 · run before any fix

40 prompts (20 EN, 15 ZH, 5 mixed; 22 adversarial) and their gold values were written by a separate agent that was told not to read this code. Both arms read each prompt once; a field is scored on whether the right value reached the engine. Runner: `scripts/paraphrase-eval.ts`.

| arm | stated limits reached correctly | wrong value used |
|---|---|---|
| regex baseline | 20/138 | 0 |
| Qwen checked intake | 127/138 | 5 |

Every fee, ceiling and size the trader stated reached the engine correctly on the Qwen arm. All five wrong values are deadlines:

- Weekday names (P02 "by fri", P23 "周五前", P36 "Friday 前"): Qwen returned 2026-10-02, a date already past. Code had no weekday reader, so the cited span was the only check and the model's date went through.
- "before Wednesday" (P14) and "周三前" (P33): the named day was kept instead of excluded.

Held and asked back (safe): "on or before October 20" (P15) and "10月12日（含）之前" (P26) were read as exclusive by code because the word "before" appeared; "by the 2nd" (P18) disagreed on month.

Debatable gold, flagged by the writer before the run: P17 "by next Friday" said on a Saturday, P34 "月底之前", P23/P33/P36 bare 前, P18 "by the 2nd", P08 "have to" as must-be-flat.

These results are published unchanged. Fixes informed by them are evaluated on a fresh blind set (v2); this set is re-run afterwards as a development set only.

## Development re-run at c20a5c7 (not a held-out number)

Same 40 prompts after the deadline fixes: Qwen arm 129/138 stated limits correct, **0 wrong values** (was 5), 6 asked back (was 3). The asks showed the model still proposing a past Friday for "by fri", so code's reading is now used when the model's date is past or looser (2a721c0 and the next commit). The held-out number comes from a fresh blind set (v2).
