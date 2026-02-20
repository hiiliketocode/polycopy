# Architecture Plan v2 — Response Notes for Cofounder Review

**From:** [Your name]  
**To:** Cofounder  
**Re:** SCALABLE_ARCHITECTURE_PLAN.md (v2)

---

## 1. Fly.io: trades only, or markets too?

The plan uses **Fly.io only for the trade stream** (no separate worker for markets). Please state clearly in the plan: do we need Fly.io for markets/prices too, or is direct pricing (app/crons) the right approach? The tradeoff (e.g. one less service vs. centralizing price refresh) should be explicit.

---

## 2. Feed live pricing — don’t pull stale data from Supabase

**Issue:** When we say “keep live pricing on the feed,” does that mean **direct API calls** or reading from the **Supabase table**?

The plan suggests the feed reads from a DB cache (e.g. 10-second refresh). But the table only refreshes every 20–25 seconds, so if the feed **polls the Supabase table** we’ll mostly be showing **stale** data. That’s not acceptable for the live feed.

**Ask:**  
- Figure out how feed pricing should work so we **do not** pull stale data from Supabase.  
- One option: **poll the API first** (live), then use that response to update Supabase — not “check Supabase first, then maybe hit API.” The feed should get live prices; Supabase can be updated as a side effect.  
- Document the chosen approach and how it stays live (including the 250 ms polling we already use).  
- Keep awareness of API rate limits and any mitigation.

---

## 3. FT snapshot — refresh on load and manual refresh

- Admin should be able to **refresh the snapshot** to get live data for the forward test.  
- Snapshot should **refresh on load** when opening the FT snapshot view.  
- Hourly cron is fine for the automated snapshot; the UI needs **on-load refresh** and an explicit **Refresh** button.

Please add this to the plan: FT snapshot = cron + refresh on load + manual refresh for admin.

---

## 4. LT execute — use fast polling, not cron

Live trade execute needs to be **fast**. At 2 minutes (cron) we miss high-quality signals that decay as price moves.

**Ask:**  
- LT execute should use something like a **5-second poll** (or equivalent). When it sees a trade that meets the criteria, it should execute — not wait for a cron.  
- Look at the **current bot system** to see how it uses polling data to execute trades.  
- It should **not** rely on a cron for execution; that’s too slow.  
- Please look behind the scenes at how live trading bot execution works today and document how it will work in the new design (event-driven or fast polling, not 2-minute cron).

---

## 5. Live fill status and LT sync order status

Fill status should work **in real time** (like a regular trade fill). This ties into LT sync order status.

**Ask:**  
- While an order is open, we need to keep pulling status until it’s **complete** so we know fill quality; otherwise it sits in “open orders” and we don’t know when it filled or at what price.  
- The plan has `lt-sync-order-status` every 2 minutes. For a live trading bot we need fill status visible in the **logs** so we can verify it’s working. Please look at how the logs work for LT sync order status and ensure we can track fill status and completion.  
- Consider whether 2 minutes is too slow for “order open → see fill” and whether we need a faster cadence or a different mechanism (e.g. webhook or more frequent sync).  
- Clarify how this may or may not be needed for the **copy trading** system and document it.

---

## 6. Refresh Copy PnL vs User Portfolio PnL

The plan optimizes **Refresh Copy PnL** (e.g. read from `markets` cache) but doesn’t spell out **User Portfolio PnL**.

**Ask:** Refresh Copy PnL and User Portfolio PnL should be the **same kind of flow** (same resolution and prices). Please add how we resolve PnLs and prices when **users check their portfolio** — same cache/flow as refresh-copy-pnl or a different path — so both are consistent and scalable.

---

## 7. Backfill Wallet PnL — Dome vs BigQuery, still needed?

**Note:** DOME_API_MIGRATION_PLAN.md says backfill-wallet-pnl uses Dome for wallet PnL and trader metrics (to be replaced with Polymarket Data API when we migrate off Dome). BigQuery is separate (predict-trade, get-polyscore for ML; currently paused).

**Ask:** Clarify in the plan: (1) what backfill-wallet-pnl uses today, (2) what it will use after Dome migration, and (3) whether we still need it once we’re off Dome / with BigQuery paused.

---

## 8. Trade-stream cap at 200 — scale for all wallets

Capping the trade stream at **200 traders** breaks the system. We need trades for **all wallets** (feed + bot), not just 200.

**Ask:**  
- Do a **cost and scaling analysis** for Fly.io to support **all** traders we care about (e.g. 2K, 3K, 5K wallets).  
- Understand whether “only $5 to increase to 1 GB” is enough; model current setup and cost at 2K / 3K / 5K wallets.  
- Plan for **2K, 3K, and 5K total wallets**; state scaling strategy and cost in the plan.

---

## 9. Market pricing — only unresolved / open markets

Market pricing should only poll or refresh **unresolved** markets. Please define “resolved” clearly in the plan so the system only considers **open** markets, not resolved ones. I believe it already works that way; the plan should double-check and state it explicitly.

---

## 10. Vercel cron jobs

Check the **other Vercel cron jobs** to see if they’re still necessary after this architecture. List which stay, which go, and why.

---

## 11. ML score function — new home (BigQuery pause)

I need to find a new home for the ML score function while BigQuery is paused. The plan doesn’t need to solve it now, but please add an **Open item**: “ML score function currently depends on BigQuery; need to relocate or replace until BigQuery is back in use.”

---

## Summary for the plan

| # | Ask |
|---|-----|
| 1 | State clearly: Fly.io for trades only, or for markets too? |
| 2 | Feed pricing: don’t pull stale from Supabase; define approach (e.g. poll API first, update DB); keep 250 ms and rate limits in mind. |
| 3 | FT snapshot: cron + refresh on load + manual refresh for admin. |
| 4 | LT execute: fast poll (e.g. 5s), not cron; document current bot flow and new design. |
| 5 | Live fill status + LT sync order status: real-time fill, logs, cadence; relation to copy trading. |
| 6 | Align Refresh Copy PnL and User Portfolio PnL; document portfolio PnL/prices. |
| 7 | Clarify backfill-wallet-pnl (Dome, post-migration, still needed?). |
| 8 | Replace 200 cap with scaling analysis for 2K–5K wallets and Fly.io cost. |
| 9 | Market pricing only for unresolved markets; define “resolved.” |
| 10 | Audit other Vercel crons; list what’s still necessary. |
| 11 | Open item: ML score function without BigQuery. |
| 12 | **Orders and markets:** Audit unused columns; add result as separate feedback item (see §12 below). |

---

## 12. Orders and markets — unused columns audit

**Request:** Check which columns in the **orders** and **markets** tables are **not** used anywhere in the codebase (app, lib, scripts, Supabase functions). Add the result as a **separate feedback item** so we can:

- See what’s safe to deprecate or drop later (after the redesign is stable)
- Avoid relying on unused columns in new migrations
- Reduce storage and cognitive load

**Suggested approach:** List all columns from the schema; search codebase for each; produce a short “Used (Y/N) + where” table. See **docs/ARCHITECTURE_PLAN_AUDIT.md** Section 6 for column lists and suggested deliverable.

---

Thanks — once these are in the plan we can align and move forward.
