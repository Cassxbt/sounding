# Commit map, history rewritten 2026-10-07

Before the repository was made public its history was rewritten once: three early analyst commits were folded into one, and planning notes that were never part of the product were removed from every commit. The code at every remaining commit is otherwise unchanged. Evidence written before then names commits by their old hashes; this table maps each to its new one. Folder names such as `dev-rerun-<hash>` and the raw result files keep the hashes they were published under.

| old | new | subject |
|---|---|---|
| f99b22d | bbbdd72 | README: what it decides, why Bitget is load-bearing, and the evidence |
| 2302c18 | 9ae3429 | Fixes from the stress test of the third-review work |
| 8d2325d | 8718aac | Agent Hub order path: an order is prepared only when it fits |
| fa5b391 | 342b0a1 | Research restated at Bitget's published fee, with a dated correction |
| 42a0da9 | 916e065 | Unknown fees priced at Bitget's published rToken rates, not 20 bps |
| e8a2b1a | 21fd812 | Exact fee cash, every figure checked, and a Chinese fallback |
| 110035c | 6c940f9 | Intake: the fallback reader passes the same checks as the model's read |
| 5d5b0c2 | fc6c093 | Atlas sampler: continue round numbering across restarts and tag the ca |
| 19dad70 | ea56b62 | Proof leads with the second blind whole-task set, scored on every rend |
| 3378d6e | 498936b | A minus sign just outside the quoted words still belongs to the number |
| 09470ac | 14f084a | Whole-task eval v2, held-out at 4a8b6d2, strict every-turn scoring: Qw |
| 4a8b6d2 | 8c64202 | Eval scorer checks every rendered turn (a question beside a card or ro |
| 9e0c9a5 | 7089e81 | One state for every surface: an open question prices nothing (no card, |
| 0fd8021 | a30cd8c | Signed negative costs and sizes are never read as positive; impossible |
| 07ba545 | 70fcfaa | Development re-runs at 8ff1a3e, labelled as such: whole-task 30/30 wit |
| 8ff1a3e | 05288cc | Two model values for one field are asked; ceilings worded under/below/ |
| 2de1580 | 41581f1 | Proof shows the held-out whole-task run with its failures; the desk's  |
| 3a075f1 | bc09469 | Research page: the census recomputed by the engine at build (best ask  |
| 6e338da | 55fdaac | A cost limit followed by bare numbers ('ceiling 改成 20 还是 25') is a sta |
| 087a66d | ebc617d | A fee quoted from someone else's clause is never used; an undecided ch |
| 6c4eafc | 625e753 | Contradictions are restatements, not distinctions: only figures tied a |
| a36c166 | 0548b25 | A message naming two instruments is asked back whichever one the model |
| b4f9879 | 7290ac6 | Whole-task eval, held-out at 78e5291: Qwen 24/30 complete, 3 critical; |
| 78e5291 | 62fe672 | A downloaded receipt replays offline to the same hash, recorded or liv |
| f07a656 | e0f5255 | Tickers: code trusts only explicit forms (rSPY, RSPYUSDT); a bare code |
| 3bbd16c | b87814d | Atlas analysis as declared in the schedule: quote versus size, fixed-f |
| d524c7f | e466299 | Whole-task eval runner: every turn through the real analyst route; com |
| 4a71efd | f4b692a | Census finding, recomputed with the engine: a fixed fee assumption fli |
| 5d97b9c | 9157eff | Invented-number check reads Chinese units (个基点, 基点) as well as bps |
| 6fab74a | 96b847c | Desk: the card shows the result the analyst ruled on (one order, one b |
| 4de58fe | 2f10dda | Evidence is dated against the decision: a past event is never relevant |
| 05571f6 | 91b14c7 | Routes: the order the words name is the order priced (controls only fi |
| c25907c | 47c880b | Engine 0.4.0: receipts carry and digest the metadata used; minimum ord |
| 105f347 | 13006a0 | Order contract: instrument and side are read with quotes and checked b |
| 5507255 | bbffceb | Route admissibility is the engine's: a cross the engine prices over th |
| df23253 | 0c8a13e | Desk opens with the fee unstated (worst case, over) so reading it from |
| 328814c | 6080fc3 | Deletion test computes Qwen's 'with it' from the code-confirmed fee an |
| 6378a28 | 66a2c91 | Desk links the pages and carries the deletion summary; scroll reveal m |
| 0c8a47d | a9352fe | Four pages: Built on Bitget (the deletion test, and what is left out a |
| 3a72a74 | a0a9e89 | Deletion test run by the engine: the lead order with each Bitget input |
| 7c6a7cb | d5ce7fa | Answer card shows the worst-fee contrast and the largest size that fit |
| b4a93ad | 6097bb2 | Reply language decided in code from the trader's message and enforced  |
| ce1f01c | 5cc1733 | Engine 0.3.2: the same book at the worst fee scenario, with the larges |
| b5ad47d | 93acee9 | Nav fits a 320 px screen: the data-source switch drops to icons below  |
| 47d1ac0 | e58689d | Redesign: the conversation is the stage. Composer with EN/中文 examples, |
| 32babbc | 37b94e2 | Analyst speaks to the trader: replies in the language of their message |
| 0b9ae15 | 66f8233 | Keep the repo to product code, tests and evidence: specs move out; neu |
| 67c3b6b | 3259b82 | Dev re-runs at b29fc63: 0 wrong values on both eval sets (v2 146/151,  |
| b29fc63 | b7d0671 | Readers for Chinese numerals in costs, k/万 sizes, today/tomorrow, 之前不要 |
| 3a9946a | bc84f2c | Paraphrase eval v2 held-out at bcf771a: Qwen checked intake 142/151 st |
| bcf771a | e15d877 | Use code's date when the model's deadline is past or looser; dev re-ru |
| 6bef5d2 | 2a721c0 | Read a bare Chinese day (8号之前, 9号) as a bare day number |
| f7ae45a | c20a5c7 | Deadlines must be confirmed by code; analyst sees the page's book and  |
| 0ba7158 | 5c9314d | Paraphrase eval v1: 40 blind prompts, regex 20/138 vs Qwen checked int |
| 7da4d5e | 4840d89 | Frozen task page, readable without JavaScript |
| 46f93e9 | bb99f1b | Constraint card, one set of terms end to end, and review fixes |
| 301b19b | 2164c97 | Clip row: priced now, remainder unpriced, admissible only by rule |
| 6454cc0 | 6517017 | Harden Last Look and tighten-only after review |
| 8de5872 | 2292fb8 | Last Look demo on real data: two Saturday rHIMS captures 21 s apart (s |
| 8411d4f | f7e6a71 | Last Look: confirm re-walks a fresh book; void on gate failure, verdic |
| db40ff8 | 918b65c | evidence: UI/API book parity check, weekend order types, replayable ra |
| 30dc348 | 321597c | intake: Qwen reads the trader's words with cited spans, code verifies  |
| 409b0ad | 0ea4c16 | engine: a stated taker fee decides the verdict and sizes the partial a |
| 1142d79 | d35c81c | deploy prep: trace fixtures into route bundles, /tmp usage log on serv |
| 8d9d15f | 60ad98c | engine 0.2.0: exact-cost ceiling comparisons; instrument precision + m |
| 70fbcf8 | 09eaa5d | analyst: Qwen 3.8 Max (Bitget S2 endpoint) behind structural validator |
| db26027 | 3cb74d3 | ui: chart-room screen with sounding line, fee-scenario verdicts, price |
| 8f72c5c | 034ea8d | engine: gates, typed intents, one-leg cost with fee scenarios, alterna |
| 50a5665 | 08850f8 | Initial commit from Create Next App |
