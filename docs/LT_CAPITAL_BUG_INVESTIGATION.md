# LT Underdog Hunter: Capital "Available" But No Fills — Investigation

## What you saw

- LT Underdog Hunter showed **cash available** in the UI.
- It had **not filled a trade since Feb 16** despite FT_ML_UNDERDOG having **153 new signals** since Feb 15.
- Rejection reason on attempts: **"Insufficient available cash: need $1.00, have $0.00 (locked: $7863.50, cooldown: $0.00)"**.

So the **execute path** was reading `available_cash = 0` and `locked_capital = 7863.50` from `lt_strategies` at the time of those attempts, even though the UI suggested capital was available.

## Root cause (findings)

1. **Capital is read from `lt_strategies` at lock time**  
   When we try to place an order we call `lockCapitalForTrade()`, which does a **fresh read** of `available_cash` and `locked_capital` from the DB. So the 0 / 7863 values were the **actual row state** when those rejections happened, not a display bug.

2. **Reconciliation has since fixed the row**  
   The **sync-order-status** cron runs **Phase 2: Capital reconciliation** every run. It recomputes:
   - `locked_capital` = sum of OPEN orders (FILLED/PARTIAL/PENDING) for that strategy  
   - `available_cash` = equity − locked − cooldown  

   For LT_FT_ML_UNDERDOG there is only **1 OPEN** order ($8). So the **correct** state is `locked_capital = 8`, `available_cash = 565.81`. That matches what you see now; reconciliation has already corrected the row.

3. **Why did we ever get locked = 7863?**  
   The only way to have `locked_capital = 7863` and `available_cash = 0` is:
   - We **locked** that amount for orders that were recorded as **PENDING** (live on book), and  
   - Either **initial_capital** was ≥ 7863 at that time (so we had room to lock that much), or  
   - There was a bug/race that allowed locked to grow beyond initial (no cap was enforced).

   Once there were many PENDING orders, each lock added to `locked_capital`. If the **sync-order-status** cron didn’t run often enough or couldn’t process them fast enough (e.g. only 100 PENDING per run across all strategies), it could take a long time to mark them LOST/CANCELLED and unlock. Until then, `available_cash` stayed 0 and every new attempt failed with "Insufficient available cash".

4. **Why the UI showed “capital available”**  
   After reconciliation ran, the **current** row was updated to `available_cash = 565.81`, `locked_capital = 8`. So once you looked at the UI again, it correctly showed cash available. The rejections you saw were from **earlier** runs when the row still had 0 / 7863.

## Fixes applied

1. **Safeguard in `lockCapitalForTrade`**  
   We now **refuse to lock** if `locked_capital + amount` would exceed `initial_capital`. So locked can never grow beyond initial, even if something creates a large number of PENDING orders.

2. **Reconciliation cap in sync-order-status**  
   When recomputing `correctLocked` from OPEN orders, we **cap** it at `initial_capital`. If the sum of OPEN orders ever exceeds initial (e.g. bad data or a past bug), we force `locked_capital` down and free the rest to `available_cash`.

3. **Larger PENDING batch per run**  
   Sync-order-status now processes **300** PENDING/PARTIAL orders per run (was 100), so backlogs of stale PENDING orders clear faster and capital is unlocked sooner.

## What to expect now

- **Current state** for LT_FT_ML_UNDERDOG is already correct: 1 OPEN ($8), so locked = 8, available = 565.81.
- **New FT signals** should again **get a lock and place** (no more “Insufficient available cash” for this strategy) as long as the row stays reconciled.
- If something similar happens again, the new safeguards will:
  - Prevent locked from ever exceeding initial capital.
  - Let reconciliation cap locked and restore available cash even if OPEN orders sum to more than initial.

## How to confirm

- Trigger or wait for the next **lt-execute** run and check that LT Underdog Hunter gets **FILLED** orders when FT_ML_UNDERDOG has new OPEN signals.
- In Vercel logs for **lt-sync-order-status**, you can confirm reconciliation and any “LOCKED CAP” messages if the cap is ever applied.
