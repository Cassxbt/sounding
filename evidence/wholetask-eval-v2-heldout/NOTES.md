# Whole-task eval v2 · held-out · run once at 4a8b6d2, published unchanged

30 new tasks (14 EN, 10 ZH, 6 mixed; 17 answer, 11 ask, 2 no-book; 22 adversarial) written by a second blind agent after the partner re-audit, scored with the stricter scorer that checks every rendered turn: a question shown beside a priced card or an admissible route, or a figure in the reply that the shown book did not produce, is critical.

| arm | complete | asked when it could answer | critical |
|---|---|---|---|
| Qwen checked intake + analyst | 28/30 | 1 | 1 |
| regex reader + template, no model | 12/30 | 15 | 3 |

- Critical, X20 "rHIMS卖出-20股": the model quoted "20股" without the minus sign, code checked only the quoted words, and a 20-share sell was priced.
- Not complete, X11: after "forget the deadline, let it fill whenever" the analyst recommended resting a limit. The scorer counts any non-cross as an abstention when the order is within; for this trader that recommendation is defensible. Left as scored.

The original set (evidence/wholetask-eval-heldout) re-scored with this stricter scorer at the same commit is 30/30, 0 critical: a development number. Fixes informed by this run come after it.
