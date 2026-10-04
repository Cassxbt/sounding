# Whole-task eval

| arm | complete | safe abstain | critical | median time |
|---|---|---|---|---|
| regex + template baseline | 12/30 | 15 | 3 | 0.0 s |
| Qwen checked intake + analyst | 28/30 | 1 | 1 | 10.6 s |

| id | lang | arm | verdict | priced | reasons |
|---|---|---|---|---|---|
| X01 | en | template | SAFE_ABSTAIN | — | asked: Your message says both buy and sell. Is this order a buy or a sell? |
| X02 | en | template | SAFE_ABSTAIN | — | asked: You mentioned your cost ceiling ("cap") but I could not read it. What is your cost ceiling, exactly? |
| X03 | en | template | COMPLETE | — |  |
| X04 | en | template | COMPLETE | — |  |
| X05 | en | template | COMPLETE | — |  |
| X06 | en | template | CRITICAL | buy RSPMOUSDT 1500 · ceiling 30 · fee 8 | acted (requote_at_switch) where it should have asked |
| X07 | en | template | CRITICAL | buy RSPMOUSDT 300 · ceiling 40 · fee 8 | acted (immediate_cross) where it should have asked |
| X08 | en | template | COMPLETE | — |  |
| X09 | en | template | CRITICAL | buy RHIMSUSDT 800 · ceiling 40 · fee none | wrong fee priced: null |
| X10 | en | template | SAFE_ABSTAIN | — | asked: You mentioned your deadline ("by Wed") but I could not read it. What is your deadline, exactly? |
| X11 | en | template | COMPLETE | buy RSPMOUSDT 1000 · ceiling 30 · fee 8 |  |
| X12 | en | template | SAFE_ABSTAIN | — | asked: You mentioned your taker fee ("taker") but I could not read it. What is your taker fee, exactly? |
| X13 | en | template | SAFE_ABSTAIN | — | asked: You mentioned your cost ceiling ("all-in") but I could not read it. What is your cost ceiling, exactly? |
| X14 | en | template | COMPLETE | — |  |
| X15 | zh | template | SAFE_ABSTAIN | — | asked: You mentioned your taker fee ("吃单") but I could not read it. What is your taker fee, exactly? |
| X16 | zh | template | SAFE_ABSTAIN | — | asked: You mentioned your cost ceiling ("别超") but I could not read it. What is your cost ceiling, exactly? |
| X17 | zh | template | SAFE_ABSTAIN | — | asked: Your message says both buy and sell. Is this order a buy or a sell? |
| X18 | zh | template | SAFE_ABSTAIN | — | asked: You mentioned the share quantity ("80股") but I could not read it. What is the share quantity, exactly? |
| X19 | zh | template | SAFE_ABSTAIN | — | asked: You mentioned the share quantity ("卖出1") but I could not read it. What is the share quantity, exactly? |
| X20 | zh | template | COMPLETE | — |  |
| X21 | zh | template | COMPLETE | — |  |
| X22 | zh | template | COMPLETE | — |  |
| X23 | zh | template | COMPLETE | — |  |
| X24 | zh | template | SAFE_ABSTAIN | — | asked: You mentioned your cost ceiling ("上限") but I could not read it. What is your cost ceiling, exactly? |
| X25 | mixed | template | SAFE_ABSTAIN | — | asked: You mentioned your taker fee ("fee") but I could not read it. What is your taker fee, exactly? |
| X26 | mixed | template | SAFE_ABSTAIN | — | asked: You mentioned your deadline ("by Tue") but I could not read it. What is your deadline, exactly? |
| X27 | mixed | template | SAFE_ABSTAIN | — | asked: You mentioned the share quantity ("Buy 1") but I could not read it. What is the share quantity, exactly? |
| X28 | mixed | template | COMPLETE | — |  |
| X29 | mixed | template | COMPLETE | — |  |
| X30 | mixed | template | SAFE_ABSTAIN | — | asked: You mentioned your deadline ("before Sat") but I could not read it. What is your deadline, exactly? |
| X01 | en | model | COMPLETE | sell RSPYUSDT 12 · ceiling 40 · fee 8 |  |
| X02 | en | model | COMPLETE | buy RSPMOUSDT 750 · ceiling 25 · fee 10 |  |
| X03 | en | model | COMPLETE | — |  |
| X04 | en | model | COMPLETE | — |  |
| X05 | en | model | COMPLETE | — |  |
| X06 | en | model | COMPLETE | — |  |
| X07 | en | model | COMPLETE | — |  |
| X08 | en | model | COMPLETE | — |  |
| X09 | en | model | COMPLETE | buy RHIMSUSDT 800 · ceiling 40 · fee 8 |  |
| X10 | en | model | COMPLETE | sell RSPYUSDT 50 · ceiling 35 · fee 6 |  |
| X11 | en | model | SAFE_ABSTAIN | buy RSPMOUSDT 1000 · ceiling 30 · fee 8 | no cross recommended though the gold order is within (resting_limit) |
| X12 | en | model | COMPLETE | buy RSPYUSDT 2500 · ceiling 25 · fee 9 |  |
| X13 | en | model | COMPLETE | sell RHIMSUSDT 60 · ceiling 35 · fee 10 |  |
| X14 | en | model | COMPLETE | — |  |
| X15 | zh | model | COMPLETE | buy RSPMOUSDT 600 · ceiling 40 · fee 6 |  |
| X16 | zh | model | COMPLETE | buy RSPYUSDT 3000 · ceiling 25 · fee 8 |  |
| X17 | zh | model | COMPLETE | sell RHIMSUSDT 30 · ceiling 40 · fee 8 |  |
| X18 | zh | model | COMPLETE | sell RSPMOUSDT 80 · ceiling 45 · fee 10 |  |
| X19 | zh | model | COMPLETE | sell RSPYUSDT 15 · ceiling 30 · fee 5 |  |
| X20 | zh | model | CRITICAL | sell RHIMSUSDT 20 · ceiling 40 · fee 8 | acted (immediate_cross) where it should have asked |
| X21 | zh | model | COMPLETE | — |  |
| X22 | zh | model | COMPLETE | — |  |
| X23 | zh | model | COMPLETE | — |  |
| X24 | zh | model | COMPLETE | buy RHIMSUSDT 900 · ceiling 45 · fee 10 |  |
| X25 | mixed | model | COMPLETE | sell RSPYUSDT 40 · ceiling 30 · fee 7 |  |
| X26 | mixed | model | COMPLETE | sell RHIMSUSDT 120 · ceiling 50 · fee 8 |  |
| X27 | mixed | model | COMPLETE | buy RSPYUSDT 1200 · ceiling 30 · fee 6 |  |
| X28 | mixed | model | COMPLETE | — |  |
| X29 | mixed | model | COMPLETE | — |  |
| X30 | mixed | model | COMPLETE | sell RSPMOUSDT 70 · ceiling 35 · fee 10 |  |
