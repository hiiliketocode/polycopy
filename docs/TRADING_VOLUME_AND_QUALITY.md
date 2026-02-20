# Trading Volume, Batching, and Quality

## Why trades come in batches (every few hours)

This is **expected** and comes from three places:

1. **Trader activity is bursty**  
   We copy leaderboard and target traders. They trade when there’s news, game events, or new markets. So Polymarket often has **clusters of activity** and then quiet periods. Our flow (FT sync → ft_orders → LT execute) follows that: we see bursts when they trade, and little when they don’t.

2. **Execution cadence**  
   - **FT sync** runs every 5 min → new Polymarket trades become new `ft_orders`.  
   - **LT execute** runs every 2 min → reads OPEN `ft_orders` (last 12h), dedupes, then places real orders.  
   So you get a new “batch” of possible trades at most every 5 minutes from sync, and execute tries them every 2 minutes. If no one on our list traded in the last 5–10 minutes, there are no new signals, so no new trades.

3. **Per-strategy time budget**  
   Each strategy gets up to **15 seconds** per run. If one strategy has hundreds of OPEN orders, we only process as many as we can in 15s and defer the rest to the next run (2 min later). So a big backlog can look like “several trades every 2 minutes” until the queue is cleared.

**Bottom line:** Batches every few hours are normal. Volume is driven by how often our copied traders trade and how many of those trades pass our filters (price band, ML, conviction, etc.), not by a bug.

---

## Should I expect more trades after the FT sync cron?

- **Before the fix:** FT sync only ran when someone triggered it (e.g. dashboard). Long gaps with no sync → no new `ft_orders` → LT had nothing to execute. You could miss whole hours of leaderboard activity.
- **After the fix:** FT sync runs every 5 min. So whenever our traders trade, we should see those signals within about 5–10 minutes and LT will attempt them on the next run(s).

So you should see **no more long “dead” gaps** where the pipeline simply didn’t see new trades. You should **not** expect a fixed “X trades per hour”: that still depends on:

- How many of our traders are active,
- How many of their trades pass each wallet’s filters (price, edge, ML, conviction, category),
- Capital and risk limits (e.g. `available_cash`, daily caps).

We also increased the OPEN `ft_orders` fetch limit from Supabase’s default 1000 to **2000** per strategy so that when there are many OPEN positions, newer signals are still considered instead of being stuck behind older ones.

---

## Trading quality: what’s in place

| Layer | What it does |
|-------|----------------|
| **FT sync filters** | Price band, min edge, ML threshold, conviction, category, exclude keywords (e.g. no crypto). Only qualifying trades get into `ft_orders`. |
| **LT pre-place checks** | Capital lock, risk (daily/market/position limits), token resolve, **dead market guard** (skip if market price collapsed vs signal), CLOB min size. |
| **Dead market guard** | Before placing, we check live midpoint. If the market has collapsed (e.g. resolved) or drifted too far from the signal price, we reject and record REJECTED (no real order). |
| **Audit script** | `npx tsx scripts/audit-ft-orders-qualification.ts [500|1000]` — checks last N `ft_orders` against each wallet’s filters and reports any **non-qualifying** trade that was taken. Run periodically to confirm no rule violations. |
| **Rejection logging** | Every REJECTED LT order is stored with `rejection_reason`; `lt_execute_logs` has stage/message (CASH_CHECK, RISK_CHECK, DEAD_MARKET, etc.). Use these to see why attempts didn’t become trades. |

From the Feb 20 optimization: **selectivity wins** — profitable bots had fewer trades per day and tighter filters (ML, conviction, price band). So “more trades” is not the goal; “right trades” is.

---

## Quick quality checklist

1. **Run the qualification audit** (e.g. weekly):  
   `npx tsx scripts/audit-ft-orders-qualification.ts 1000`  
   Expect **0 violations**. If any appear, fix the wallet filter or sync logic.

2. **Inspect rejections** (Supabase or logs):  
   - `SELECT status, rejection_reason, COUNT(*) FROM lt_orders WHERE order_placed_at > NOW() - INTERVAL '7 days' GROUP BY status, rejection_reason;`  
   - High CASH_CHECK → capital or lock issue.  
   - High DEAD_MARKET → signals often stale by the time we run (could tune dead_market_guard or sync/execute frequency).  
   - High RISK_CHECK → hitting daily/market/position limits (by design).

3. **Compare FT vs LT**  
   FT is the “paper” signal; LT is real money. If FT has many OPEN orders but LT has few FILLED and many REJECTED, the reasons above (capital, risk, dead market) explain it. Use `last_sync_time` and `available_cash` per strategy to confirm they’re not starved.

4. **Re-run bot audit** (from BOT_OPTIMIZATION_SESSION_FEB20):  
   `npx tsx scripts/bot-program-audit.ts`  
   Use it to spot underperformers, zero-trade bots, and config drift.

---

*Short doc added to clarify volume vs quality and how batching works.*
