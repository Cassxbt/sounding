# Paraphrase eval v2 · held-out · run at bcf771a, published unchanged

40 prompts (18 EN, 16 ZH, 6 mixed; 28 adversarial; today = Wednesday 2026-10-07 NY), written by a second blind agent that read neither the code nor eval v1. Run once, before anyone on the build side read the prompts.

| arm | stated limits reached correctly | wrong value used | asked back |
|---|---|---|---|
| regex baseline | 19/151 | 2 | 0 |
| Qwen checked intake | **142/151 (94%)** | 1 | 3 |

Adversarial cases (other people's fees, maker vs taker, corrected fees, price moves, negated ceilings, "not before", cancelled and past deadlines): 95/99 stated limits correct on the Qwen arm.

The one wrong value: "成本上限千分之六" reached the engine as a 6 bps ceiling instead of 60 (stricter, but wrong); code had no reader for Chinese numerals, so the model's reading stood. Other misses: "1.2k / 2k USDT" asked back (code's quantity reader lacked the k suffix), "10月13日之前不要卖" read as a deadline although it is an earliest date, "明天之内" asked back, two must-be-flat calls the writer flagged as debatable, and two deadlines the model omitted.

Fixes informed by this run come after it; any later run of this set is a development run.

## Development re-run at b29fc63 (after fixes informed by this set; not held-out)

Qwen arm 146/151 stated limits, 0 wrong values, 0 asked back. Eval v1 at the same commit: 135/138, 0 wrong values.
