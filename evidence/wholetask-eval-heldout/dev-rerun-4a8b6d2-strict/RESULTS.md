# Whole-task eval

| arm | complete | safe abstain | critical | median time |
|---|---|---|---|---|
| regex + template baseline | 14/30 | 14 | 2 | 0.0 s |
| Qwen checked intake + analyst | 30/30 | 0 | 0 | 10.9 s |

| id | lang | arm | verdict | priced | reasons |
|---|---|---|---|---|---|
| W01 | en | template | COMPLETE | buy RSPYUSDT 1000 · ceiling 40 · fee 8 |  |
| W02 | en | template | SAFE_ABSTAIN | — | asked: You mentioned your taker fee ("taker") but I could not read it. What is your taker fee, exactly? |
| W03 | en | template | SAFE_ABSTAIN | — | asked: You mentioned your deadline ("by Wed") but I could not read it. What is your deadline, exactly? |
| W04 | en | template | COMPLETE | sell RSPMOUSDT 40 · ceiling 35 · fee 6 |  |
| W05 | en | template | COMPLETE | — |  |
| W06 | en | template | COMPLETE | — |  |
| W07 | en | template | COMPLETE | — |  |
| W08 | en | template | SAFE_ABSTAIN | — | asked: You mentioned your cost ceiling ("ceiling") but I could not read it. What is your cost ceiling, exactly? |
| W09 | en | template | SAFE_ABSTAIN | — | asked: You mentioned your cost ceiling ("Ceiling") but I could not read it. What is your cost ceiling, exactly? |
| W10 | en | template | COMPLETE | sell RSPMOUSDT 75 · ceiling 40 · fee 8 |  |
| W11 | en | template | CRITICAL | sell RSPYUSDT 10 · ceiling 40 · fee 6 | acted (immediate_cross) where it should have asked |
| W12 | en | template | COMPLETE | — |  |
| W13 | en | template | SAFE_ABSTAIN | — | asked: You mentioned your deadline ("before Fri") but I could not read it. What is your deadline, exactly? |
| W14 | en | template | SAFE_ABSTAIN | — | asked: You mentioned your cost ceiling ("ceiling") but I could not read it. What is your cost ceiling, exactly? |
| W15 | en | template | COMPLETE | — |  |
| W16 | zh | template | SAFE_ABSTAIN | — | asked: Your message says both buy and sell. Is this order a buy or a sell? |
| W17 | zh | template | SAFE_ABSTAIN | — | asked: You mentioned your taker fee ("吃单") but I could not read it. What is your taker fee, exactly? |
| W18 | zh | template | SAFE_ABSTAIN | — | asked: You mentioned the share quantity ("60 股") but I could not read it. What is the share quantity, exactly? |
| W19 | zh | template | COMPLETE | — |  |
| W20 | zh | template | COMPLETE | — |  |
| W21 | zh | template | SAFE_ABSTAIN | — | asked: You mentioned your cost ceiling ("上限") but I could not read it. What is your cost ceiling, exactly? |
| W22 | zh | template | SAFE_ABSTAIN | — | asked: You mentioned your deadline ("截止") but I could not read it. What is your deadline, exactly? |
| W23 | zh | template | SAFE_ABSTAIN | — | asked: You mentioned the share quantity ("30 股") but I could not read it. What is the share quantity, exactly? |
| W24 | zh | template | COMPLETE | — |  |
| W25 | zh | template | SAFE_ABSTAIN | — | asked: You mentioned your taker fee ("手续费") but I could not read it. What is your taker fee, exactly? |
| W26 | mixed | template | COMPLETE | buy RSPYUSDT 1000 · ceiling 40 · fee 8 |  |
| W27 | mixed | template | SAFE_ABSTAIN | — | asked: You mentioned your taker fee ("fee") but I could not read it. What is your taker fee, exactly? |
| W28 | mixed | template | COMPLETE | — |  |
| W29 | mixed | template | COMPLETE | — |  |
| W30 | mixed | template | CRITICAL | sell RSPMOUSDT 600 · ceiling 50 · fee 8 | wrong size priced: 600 |
| W01 | en | model | COMPLETE | buy RSPYUSDT 1000 · ceiling 40 · fee 8 |  |
| W02 | en | model | COMPLETE | buy RSPYUSDT 2500 · ceiling 50 · fee 8 |  |
| W03 | en | model | COMPLETE | sell RHIMSUSDT 250 · ceiling 60 · fee 10 |  |
| W04 | en | model | COMPLETE | sell RSPMOUSDT 40 · ceiling 35 · fee 6 |  |
| W05 | en | model | COMPLETE | — |  |
| W06 | en | model | COMPLETE | — |  |
| W07 | en | model | COMPLETE | — |  |
| W08 | en | model | COMPLETE | sell RHIMSUSDT 120 · ceiling 30 · fee 8 |  |
| W09 | en | model | COMPLETE | buy RSPYUSDT 5000 · ceiling 0 · fee 5 |  |
| W10 | en | model | COMPLETE | sell RSPMOUSDT 75 · ceiling 40 · fee 8 |  |
| W11 | en | model | COMPLETE | — |  |
| W12 | en | model | COMPLETE | — |  |
| W13 | en | model | COMPLETE | sell RSPYUSDT 15 · ceiling 30 · fee 8 |  |
| W14 | en | model | COMPLETE | buy RSPMOUSDT 800 · ceiling 10 · fee 8 |  |
| W15 | en | model | COMPLETE | — |  |
| W16 | zh | model | COMPLETE | buy RSPYUSDT 1000 · ceiling 40 · fee 8 |  |
| W17 | zh | model | COMPLETE | buy RSPYUSDT 1500 · ceiling 45 · fee 8 |  |
| W18 | zh | model | COMPLETE | sell RSPMOUSDT 60 · ceiling 50 · fee 8 |  |
| W19 | zh | model | COMPLETE | — |  |
| W20 | zh | model | COMPLETE | — |  |
| W21 | zh | model | COMPLETE | sell RSPYUSDT 8 · ceiling 30 · fee 6 |  |
| W22 | zh | model | COMPLETE | sell RHIMSUSDT 300 · ceiling 45 · fee 8 |  |
| W23 | zh | model | COMPLETE | sell RSPMOUSDT 30 · ceiling 50 · fee 6 |  |
| W24 | zh | model | COMPLETE | — |  |
| W25 | zh | model | COMPLETE | buy RHIMSUSDT 300 · ceiling 5 · fee 8 |  |
| W26 | mixed | model | COMPLETE | buy RSPYUSDT 1000 · ceiling 40 · fee 8 |  |
| W27 | mixed | model | COMPLETE | sell RSPYUSDT 12 · ceiling 35 · fee 8 |  |
| W28 | mixed | model | COMPLETE | — |  |
| W29 | mixed | model | COMPLETE | — |  |
| W30 | mixed | model | COMPLETE | sell RSPMOUSDT 25 · ceiling 50 · fee 8 |  |
