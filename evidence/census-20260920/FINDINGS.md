# Quote versus size on one Sunday snapshot (2026-09-20 09:03 UTC)

Recomputed with Sounding's own book walk (`scripts/census-inversions.ts`) from the stored raw census of the 90 weekend-tradable rTokens (`eligible-census-RAW-20260920T0902Z.json`, sha256 1ed062d3a5e907014fdf748782c4efb74ff8cd0032d5d0a1f7fa9a1feeabe6e4). Buys of a USDT budget, cost against each book's displayed mid, plus the taker fee. An independent partner recomputation with its own script found the same 16, the same six names and the same median.

| buy budget | ceiling | within at an assumed 10 bps fee but over at a real 20 bps | best ask says within at 20 bps, full size says over |
|---|---|---|---|
| 1,000 USDT | 30 bps | 31 of 90 | 6 of 90 |
| 1,000 USDT | 50 bps | 8 of 90 | 4 of 90 |
| 5,000 USDT | 30 bps | 25 of 90 | 27 of 90 |
| 5,000 USDT | 50 bps | 5 of 90 | 6 of 90 |
| 25,000 USDT | 30 bps | 9 of 89 | 40 of 89 |
| 25,000 USDT | 50 bps | 19 of 89 | 57 of 89 |

At 5,000 USDT, 20 bps and a 50 bps ceiling: 16 of 90 names are over at full size; median all-in 38.6031 bps; the six where the best ask says yes and the full order says no are RRKLB, RSPMO, RDDOG, REWY, RAEHR and RMARA.

What this is not: one snapshot of one weekend session, not a rate for weekends in general, and not a statement about fills. The repeated atlas (`evidence/atlas-202610/SCHEDULE.md`) tests whether it holds across sessions.
