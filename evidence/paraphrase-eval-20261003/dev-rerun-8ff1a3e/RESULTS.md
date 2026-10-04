# Paraphrase eval · 40 prompts · today 2026-10-03 NY

Prompts and gold values were written by a separate agent that never saw the code. Each stated limit is scored on whether the right value reached the engine.

| arm | stated limits that reached the engine correctly | cases fully right | wrong value used | missed | invented | held (asked back) |
|---|---|---|---|---|---|---|
| regex baseline | 22/138 | 2/40 | 0 | 39 | 0 | 77 |
| Qwen checked intake | 135/138 | 36/40 | 0 | 2 | 1 | 1 |

The regex arm has no ceiling reader: before checked intake the ceiling came only from the form.

| id | lang | adv | text | arm | takerFeeBps | ceilingBps | hardDeadlineNy | mustBeFlat | sizeShares | sizeQuoteUsdt |
|---|---|---|---|---|---|---|---|---|---|---|
| P01 | en |  | Selling 178.4121 rHIMS. My taker fee is 0.08%, I won't accept more than 0.5% all-in cost, and I must be flat before Oct 8. | regex | held | held | held | ✓ | missed | ✓ |
| P01 | en |  |  | qwen | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| P02 | en |  | sell 250 rNVDA, 8bp taker, cap 30bp all in, out by fri hard | regex | held | held | held | missed (false) | ✓ | ✓ |
| P02 | en |  |  | qwen | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| P03 | en |  | Hi, I'd like to buy rSPY with 1000 USDT. I pay 10 basis points as taker. I'd prefer total costs to stay under 40bp. | regex | held | held | ✓ | ✓ | ✓ | ✓ |
| P03 | en |  |  | qwen | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| P04 | en | y | maker is 2bp, I pay 8bp taker. dumping 40 rTSLA, max half a percent total, need to be done by the 9th. | regex | held | held | held | missed (false) | missed | ✓ |
| P04 | en | y |  | qwen | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| P05 | en | y | Don't want to pay more than 0.4% all in on this rAAPL sale, 120 shares. Fee's 0.1% taker. | regex | held | held | ✓ | ✓ | ✓ | ✓ |
| P05 | en | y |  | qwen | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| P06 | en | y | My friend pays 6bp taker on Bitget, not sure what mine is. Want to sell 33.5 rMSFT, keep it under 0.3% all-in. | regex | ✓ | held | ✓ | ✓ | ✓ | ✓ |
| P06 | en | y |  | qwen | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| P07 | en | y | sell 500 rAMD, fee is 10, sorry, 8bps taker. ceiling 60bp. must be out by the 12th | regex | held | held | held | ✓ | ✓ | ✓ |
| P07 | en | y |  | qwen | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| P08 | en | y | rNVDA up 4.5% today lol, have to take profit on 75 shares before Tuesday, 8 basis points taker | regex | held | ✓ | held | missed (false) | ✓ | ✓ |
| P08 | en | y |  | qwen | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| P09 | en | y | Selling 90 rGOOGL but not before the 8th, earnings play. taker 0.06%. max 35bp. | regex | held | held | ✓ | ✓ | missed | ✓ |
| P09 | en | y |  | qwen | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| P10 | en | y | Was supposed to be out of my 64 rMETA by Friday but that's cancelled, I can hold through whenever. Taker is 8 bps. | regex | held | ✓ | ✓ | ✓ | missed | ✓ |
| P10 | en | y |  | qwen | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| P11 | en | y | hey what's the deal with rTokens, are they actually backed? thinking about it | regex | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| P11 | en | y |  | qwen | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| P12 | en |  | ok so i got 1,250.5 rSPY i need to unload and my takr fee is 0.08% and honestly i dont wanna eat more than like 0.45% total and i HAVE to be flat by oct 16 no exceptions | regex | held | missed | ✓ | missed (false) | missed | ✓ |
| P12 | en |  |  | qwen | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| P13 | en |  | Buy 2500 USDT of rQQQ. Taker 8bp. Max cost 25 bps. | regex | held | held | ✓ | ✓ | ✓ | ✓ |
| P13 | en |  |  | qwen | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| P14 | en |  | Need to sell 18 rCOST before Wednesday, must be completely out. Cost ceiling 0.35%. | regex | ✓ | held | held | missed (false) | ✓ | ✓ |
| P14 | en |  |  | qwen | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| P15 | en |  | Selling 300 rINTC on or before October 20. Optional though, if the spread is ugly I'll just hold. 10bps taker fee, budget 50bp all in. | regex | ✓ | held | held | ✓ | missed | ✓ |
| P15 | en |  |  | qwen | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| P16 | en | y | VIP1 so my taker is 0.08%; the standard 0.1% taker doesn't apply to me. Selling 45.25 rNFLX, ceiling 0.6%. | regex | held | held | ✓ | ✓ | missed | ✓ |
| P16 | en | y |  | qwen | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| P17 | en | y | Sell 100 rBA by next Friday, max 40bp, 8bp taker. | regex | held | held | ✓ | ✓ | ✓ | ✓ |
| P17 | en | y |  | qwen | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| P18 | en | y | dump 60 rPLTR by the 2nd, 8 bps taker, cap 50bp, must be out | regex | held | held | held | ✓ | missed | ✓ |
| P18 | en | y |  | qwen | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| P19 | en |  | Please buy rSPY for 500 USDT before the 7th. My taker fee is 8 basis points and I'd like the all-in cost to be no more than 0.2%. | regex | held | held | held | ✓ | ✓ | ✓ |
| P19 | en |  |  | qwen | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| P20 | en |  | rMSTR 12 shares sell, fee 0.12% taker, ceiling 80 bps, have to be done by Monday | regex | held | held | held | missed (false) | ✓ | ✓ |
| P20 | en |  |  | qwen | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| P21 | zh |  | 我要卖出 178.4121 股 rHIMS，吃单手续费千分之0.8，总成本不能超过千分之五，必须在10月8日之前清仓。 | regex | held | missed | held | missed (false) | missed | ✓ |
| P21 | zh |  |  | qwen | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| P22 | zh |  | 帮我买入 rSPY，花 1000 USDT，吃单费率万8，总成本控制在0.3%以内。 | regex | held | held | ✓ | ✓ | ✓ | ✓ |
| P22 | zh |  |  | qwen | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| P23 | zh |  | 卖200股rNVDA，手续费万分之八，最多接受50个基点的成本，周五前必须全部卖完。 | regex | held | held | held | missed (false) | missed | ✓ |
| P23 | zh |  |  | qwen | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| P24 | zh | y | 挂单费率万2，我吃单是万8。卖出 50 股 rTSLA，总成本不超过千分之四。 | regex | held | held | ✓ | ✓ | missed | ✓ |
| P24 | zh | y |  | qwen | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| P25 | zh | y | 我朋友吃单费是万6，我的不清楚。想卖 30 股 rAAPL，成本别超过0.5%。 | regex | ✓ | held | ✓ | ✓ | missed | ✓ |
| P25 | zh | y |  | qwen | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| P26 | zh | y | 卖出 80 股 rAMD，手续费0.1%，不对，是0.08%。成本上限千分之六，10月12日（含）之前必须出完。 | regex | held | held | missed | missed (false) | missed | ✓ |
| P26 | zh | y |  | qwen | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| P27 | zh | y | rNVDA今天涨了5%，我想把手上的 100 股卖掉，吃单手续费万分之八。 | regex | held | ✓ | ✓ | ✓ | missed | ✓ |
| P27 | zh | y |  | qwen | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| P28 | zh | y | 15号以后再卖，不要在15号之前卖。120股rGOOGL，费率千分之一。 | regex | held | ✓ | ✓ | ✓ | missed | ✓ |
| P28 | zh | y |  | qwen | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| P29 | zh | y | 本来要求周三以前清仓的，现在不用了，可以继续拿着。持有 64 股 rMETA，吃单费万8。 | regex | held | ✓ | ✓ | ✓ | missed | ✓ |
| P29 | zh | y |  | qwen | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| P30 | zh | y | rToken 是什么？跟普通股票有什么区别？ | regex | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| P30 | zh | y |  | qwen | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| P31 | zh |  | 帮我用 2500 USDT 买 rQQQ，最晚10月9日买到，总成本不超过25个基点。 | regex | ✓ | held | held | ✓ | ✓ | ✓ |
| P31 | zh |  |  | qwen | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| P32 | zh |  | 300股rINTC，最好10月20号以前卖掉，不过不是硬性要求，拿着也行。吃单费率0.1%，总成本上限0.5%。 | regex | held | held | held | ✓ | missed | ✓ |
| P32 | zh |  |  | qwen | ✓ | ✓ | missed | ✓ | ✓ | ✓ |
| P33 | zh |  | rCOST 卖18股 吃单万5 成本上限万分之三十五 周三前必须出 | regex | held | held | held | missed (false) | missed | ✓ |
| P33 | zh |  |  | qwen | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| P34 | zh | y | 月底之前处理掉 45 股 rNFLX，吃单万8，成本别超千分之六。 | regex | held | held | ✓ | ✓ | missed | ✓ |
| P34 | zh | y |  | qwen | ✓ | ✓ | ✓ | invented (true) | ✓ | ✓ |
| P35 | zh |  | 您好，我想卖出 1250.5 股 rSPY。我的吃单手续费是0.08%，可接受的总成本最高0.45%。必须在16号之前全部卖出。 | regex | held | missed | held | missed (false) | missed | ✓ |
| P35 | zh |  |  | qwen | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| P36 | mixed |  | sell 250 rNVDA, taker 万8, all-in 不超过 30bp, Friday 前必须 flat | regex | held | held | missed | missed (false) | ✓ | ✓ |
| P36 | mixed |  |  | qwen | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| P37 | mixed | y | maker 0.02%, taker 0.08%，我是 taker。买 rSPY 1000U, cost cap 千分之三 | regex | held | held | ✓ | ✓ | ✓ | missed |
| P37 | mixed | y |  | qwen | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| P38 | mixed |  | 帮我 sell 40 rTSLA by Oct 9, fee 8bp, 最多 half a percent, 可以 hold 过去 if needed | regex | held | held | ✓ | ✓ | ✓ | ✓ |
| P38 | mixed |  |  | qwen | ✓ | ✓ | missed | ✓ | ✓ | ✓ |
| P39 | mixed | y | rAMD 跌了 3%，想 buy 200 USDT worth，我老婆账户 taker 是 5bp，我的是 10bp | regex | held | ✓ | ✓ | ✓ | ✓ | ✓ |
| P39 | mixed | y |  | qwen | held | ✓ | ✓ | ✓ | ✓ | ✓ |
| P40 | mixed | y | 原本 deadline 是 10/8，now 不需要了, can hold. 卖 90 rGOOGL, ceiling 0.4% | regex | ✓ | held | ✓ | ✓ | missed | ✓ |
| P40 | mixed | y |  | qwen | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
