# Paraphrase eval · 40 prompts · today 2026-10-07 NY

Prompts and gold values were written by a separate agent that never saw the code. Each stated limit is scored on whether the right value reached the engine.

| arm | stated limits that reached the engine correctly | cases fully right | wrong value used | missed | invented | held (asked back) |
|---|---|---|---|---|---|---|
| regex baseline | 19/151 | 2/40 | 2 | 130 | 1 | 0 |
| Qwen checked intake | 142/151 | 30/40 | 1 | 5 | 3 | 3 |

The regex arm has no ceiling reader: before checked intake the ceiling came only from the form.

| id | lang | adv | text | arm | takerFeeBps | ceilingBps | hardDeadlineNy | mustBeFlat | sizeShares | sizeQuoteUsdt |
|---|---|---|---|---|---|---|---|---|---|---|
| H01 | en |  | Selling 40 rAAPL. I pay 0.08% taker, all-in cost cap is half a percent. Need to be flat by Friday. | regex | missed | missed | missed | ✓ | missed | ✓ |
| H01 | en |  |  | qwen | ✓ | ✓ | missed | ✓ | ✓ | ✓ |
| H02 | en |  | buy rMSFT w/ 2,500 USDT, taker 6bp, max 35bp all in, have to be done before the 12th | regex | missed | missed | missed | missed (false) | ✓ | wrong (500) |
| H02 | en |  |  | qwen | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| H03 | en |  | Hi, I'd like to sell 12.5 shares of rMETA. My taker fee is 0.1% and I'd accept at most 0.45% total execution cost. I must be completely out on or before October 14. Thank you! | regex | missed | missed | missed | missed (false) | ✓ | ✓ |
| H03 | en |  |  | qwen | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| H04 | en |  | dump 300 rSPY, fee 5bps taker, cap 20bps, gotta be flat by thursday | regex | ✓ | missed | missed | missed (false) | missed | ✓ |
| H04 | en |  |  | qwen | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| H05 | en |  | wanna buy rAMZN for 1.2k usdt. takr fee 0.075%, wont go above 0.4% all in. by fri oct 9 ideally but i can hold thru if it doesnt fill | regex | missed | missed | missed | ✓ | ✓ | missed |
| H05 | en |  |  | qwen | ✓ | ✓ | missed | ✓ | ✓ | held |
| H06 | en | y | Selling 75 rCOIN. Fees on my tier: maker 0.02%, taker 0.06%. Keep total cost under 30bp. By the 13th. | regex | missed | missed | missed | ✓ | missed | ✓ |
| H06 | en | y |  | qwen | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| H07 | en | y | My buddy pays 4bp taker on his VIP account, I'm on the regular 10bp. Buying rMSTR with 5000 USDT, max 0.6% all-in, must be in before Friday. | regex | missed | missed | missed | missed (false) | ✓ | ✓ |
| H07 | en | y |  | qwen | ✓ | ✓ | ✓ | missed (false) | ✓ | ✓ |
| H08 | en | y | sell 20 rARM, taker is 0.1%... wait no, I got bumped to VIP1, it's 0.08% now. ceiling 40bp, by Oct 12. | regex | missed | missed | ✓ | ✓ | ✓ | ✓ |
| H08 | en | y |  | qwen | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| H09 | en | y | rMU ripped 6% today and I think it can do another 3%. Selling 150 shares, my taker is 8bp. | regex | missed | ✓ | ✓ | ✓ | ✓ | ✓ |
| H09 | en | y |  | qwen | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| H10 | en | y | Good morning. I'm buying rAVGO with 3,000 USDT and I won't pay more than 25 bps all-in. My taker fee is 0.05%. I need this done by the 9th. | regex | missed | missed | missed | missed (false) | ✓ | wrong (000) |
| H10 | en | y |  | qwen | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| H11 | en | y | Sell 60 rORCL after earnings, not before Oct 9. Taker 0.08%, cap 0.35% total. | regex | missed | missed | ✓ | ✓ | ✓ | ✓ |
| H11 | en | y |  | qwen | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| H12 | en | y | Selling 500 rHOOD. Was going to say out by Friday but scratch that, no deadline, I can hold over the weekend. Taker 6bp, max cost 40bp. | regex | missed | missed | ✓ | ✓ | missed | ✓ |
| H12 | en | y |  | qwen | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| H13 | en | y | Buy 2 rASML. 8bps taker. Ceiling 0.25%. I have to be filled on or before Tuesday the 13th, inclusive. | regex | missed | missed | missed | missed (false) | ✓ | ✓ |
| H13 | en | y |  | qwen | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| H14 | en | y | pls sell 35 rCRWD by oct 5th, taker 0.1%, cap 50bp | regex | missed | missed | invented (2026-10-05) | ✓ | ✓ | ✓ |
| H14 | en | y |  | qwen | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| H15 | en | y | Sell 18 rSNOW by Wednesday. taker 7bp, cost cap 30bp. Must be flat. | regex | missed | missed | missed | ✓ | ✓ | ✓ |
| H15 | en | y |  | qwen | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| H16 | en | y | Buy rTSM with 800 USDT sometime next week, taker 0.08%, max 0.5%. | regex | missed | missed | ✓ | ✓ | ✓ | ✓ |
| H16 | en | y |  | qwen | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| H17 | en | y | gm, anyone know if the rQQQ market is open on Columbus Day? | regex | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| H17 | en | y |  | qwen | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| H18 | en |  | Selling 1,250 rBABA. I'm charged 0.0008 per side as taker, cap all-in at 0.003, out by Oct 16. | regex | missed | missed | ✓ | ✓ | missed | ✓ |
| H18 | en |  |  | qwen | ✓ | ✓ | ✓ | invented (true) | ✓ | ✓ |
| H19 | zh | y | 卖出 rPDD 200 股，我的吃单手续费万8，全部成本不超过千分之五，必须在10月9日（含）之前卖完。 | regex | missed | missed | missed | missed (false) | missed | ✓ |
| H19 | zh | y |  | qwen | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| H20 | zh |  | 用 3000 USDT 买 rAAPL，taker 费率 0.06%，总成本上限 0.4%，10月12日之前一定要成交。 | regex | missed | missed | missed | missed (false) | ✓ | missed |
| H20 | zh |  |  | qwen | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| H21 | zh |  | rMETA 帮我卖 30 股，吃单费千分之0.8，成本别超过0.3%，周五前搞定 | regex | missed | missed | missed | ✓ | missed | ✓ |
| H21 | zh |  |  | qwen | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| H22 | zh | y | 卖 rCOIN 45 股。我挂单费万2，吃单费万6。整体执行成本控制在万分之三十五以内。最晚10月13日。 | regex | missed | missed | missed | ✓ | missed | ✓ |
| H22 | zh | y |  | qwen | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| H23 | zh | y | 我朋友的吃单费是万4，我是普通用户，吃单万10。买 rMSFT，预算 1500 USDT，成本上限千分之六，10月14日前必须买到。 | regex | missed | missed | missed | missed (false) | ✓ | missed |
| H23 | zh | y |  | qwen | ✓ | wrong (6) | ✓ | missed (false) | ✓ | ✓ |
| H24 | zh | y | 卖出 rAMZN 25 股，手续费千分之一，哦不对，我刚升了VIP，现在吃单是万分之七。成本上限0.35%，10月15日之前。 | regex | missed | missed | missed | ✓ | missed | ✓ |
| H24 | zh | y |  | qwen | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| H25 | zh | y | rMSTR 今天跌了8%，我想抄底买 2000 USDT 的。吃单费0.08%。 | regex | missed | ✓ | ✓ | ✓ | ✓ | missed |
| H25 | zh | y |  | qwen | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| H26 | zh | y | 买 rARM 10 股，成本最多不能超过万分之四十，我的 taker 费万五，必须周四之前买完。 | regex | missed | missed | missed | missed (false) | missed | ✓ |
| H26 | zh | y |  | qwen | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| H27 | zh | y | rSPY 卖 80 股，10月13日之前不要卖，吃单万6，成本上限千分之三。 | regex | missed | missed | ✓ | ✓ | missed | ✓ |
| H27 | zh | y |  | qwen | ✓ | ✓ | invented (2026-10-12) | ✓ | ✓ | ✓ |
| H28 | zh | y | 卖掉 rMU 120 股。原本说周五前必须清仓，现在不用了，可以拿着过周末。吃单0.1%，总成本不超过0.5%。 | regex | missed | missed | ✓ | ✓ | missed | ✓ |
| H28 | zh | y |  | qwen | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| H29 | zh | y | 买 rAVGO 5 股，最晚10月6日，吃单万8，上限千分之四。 | regex | missed | missed | ✓ | ✓ | missed | ✓ |
| H29 | zh | y |  | qwen | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| H30 | zh | y | rORCL 卖 33 股，最晚周三，一定要卖完。吃单万分之六，成本上限万分之二十五。 | regex | missed | missed | missed | missed (false) | missed | ✓ |
| H30 | zh | y |  | qwen | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| H31 | zh | y | rHOOD 卖 400 股，月底前清掉就行，吃单万6，成本上限千分之四。 | regex | missed | missed | ✓ | ✓ | missed | ✓ |
| H31 | zh | y |  | qwen | ✓ | ✓ | ✓ | invented (true) | ✓ | ✓ |
| H32 | zh | y | 在吗？ | regex | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| H32 | zh | y |  | qwen | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| H33 | zh |  | 帮我买 rTSM，花 4,800 USDT，吃单万分之八，明天之内必须买完。 | regex | missed | ✓ | missed | missed (false) | ✓ | missed |
| H33 | zh |  |  | qwen | ✓ | ✓ | held | ✓ | ✓ | ✓ |
| H34 | zh |  | 卖出 rASML 3.5 股，不赶时间，持有过周末也没问题。手续费我不清楚。 | regex | ✓ | ✓ | ✓ | ✓ | missed | ✓ |
| H34 | zh |  |  | qwen | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| H35 | mixed |  | sell 50 rDELL，taker fee 0.08%，all-in cost 不超过 40bp，must be flat by 10月9日 | regex | missed | missed | missed | ✓ | ✓ | ✓ |
| H35 | mixed |  |  | qwen | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| H36 | mixed |  | 买 rBABA 2k USDT, taker 万6, ceiling 千分之五, 10月10号前 must 成交 | regex | missed | missed | missed | missed (false) | ✓ | missed |
| H36 | mixed |  |  | qwen | ✓ | ✓ | ✓ | ✓ | ✓ | held |
| H37 | mixed | y | 我的 maker fee 是 0.02%, taker 0.07%, 我同事 taker 才 0.04%. 卖 rQQQ 90 股, max 0.3% all in, by Friday 就行, 拿过周末也OK | regex | missed | missed | missed | ✓ | missed | ✓ |
| H37 | mixed | y |  | qwen | ✓ | ✓ | missed | ✓ | ✓ | ✓ |
| H38 | mixed | y | sell 15 rCRWD by next Friday 吧, taker 万8, 成本上限 50bp | regex | missed | missed | ✓ | ✓ | ✓ | ✓ |
| H38 | mixed | y |  | qwen | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| H39 | mixed | y | Bitget default taker 是 0.1%, 但我用 BGB 抵扣, 实际付 0.08%. sell 22 rAMZN, cost 上限 千分之四, 周一前 must 出 | regex | missed | missed | missed | missed (false) | ✓ | ✓ |
| H39 | mixed | y |  | qwen | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| H40 | mixed | y | buy rMSFT w 600 usdt after 10月8号, taker 8bp, 成本max 0.5% | regex | missed | missed | ✓ | ✓ | ✓ | ✓ |
| H40 | mixed | y |  | qwen | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
