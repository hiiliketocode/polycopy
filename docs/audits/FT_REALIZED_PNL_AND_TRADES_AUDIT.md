# FT Realized P&L vs Recent Trades – Audit

**Date:** February 2026  
**Scope:** Why “Recent Trades” (closed) don’t add up to Realized P&L on FT test detail screens, and related data checks.

---

## 1. Why the numbers don’t add up (main cause)

**Realized P&L** is the sum of **all** resolved orders’ `pnl` for that wallet.  
**Recent Trades** shows only the **last 50** resolved trades (by `order_time` desc).

So:

- If a wallet has **126 resolved** trades, Realized P&L = sum of all 126 trades’ P&L.
- The table only shows the **50 most recent** of those 126.
- Summing the 50 visible rows will **not** equal total Realized P&L, because the other **76** resolved trades are not in the table.

**Conclusion:** This is by design (UI limit), not missing data. The table is a “last 50” window; the card is the full total.

---

## 2. Data flow (verified)

| Item | Source | Notes |
|------|--------|------|
| **Realized P&L** | `GET /api/ft/wallets/[id]` | `realizedPnl = resolvedOrders.reduce((sum, o) => sum + (o.pnl \|\| 0), 0)` over **all** resolved orders. |
| **Resolved count** | Same API | `stats.won + stats.lost` = number of resolved trades. |
| **Recent trades** | Same API | `recent_trades = resolvedOrders.slice(0, 50)` (same `resolvedOrders` array, order_time desc). |
| **Order of resolved** | `allOrders` from DB with `.order('order_time', { ascending: false })`, then `resolvedOrders = allOrders.filter(o => o.outcome !== 'OPEN')` → “recent” = first 50 by time. |

So:

- Realized P&L and “126 resolved” come from the same set of resolved orders.
- Recent Trades is a subset of that set (last 50 by time).
- No double-counting; no resolved orders excluded from Realized P&L.

---

## 3. Other data-quality checks

### 3.1 Missing trades?

- **All orders** are loaded with pagination (1000 per page) in `GET /api/ft/wallets/[id]` until no more pages. So no cap at 1000 for the wallet.
- **Resolved** = every order with `outcome !== 'OPEN'` (i.e. WON/LOST). All of these are included in `realizedPnl`.
- **Recent Trades** is only a display limit (50); it does not remove any orders from the backend.

So realized P&L is not missing trades; the only “missing” is that the table doesn’t show the older resolved trades (e.g. 76 of 126).

### 3.2 PnL formula (resolved)

- Resolve logic is in `app/api/ft/resolve/route.ts`.
- BUY WON: `pnl = size * (1 - entry_price) / entry_price` (fixed in migration `20260207_fix_ft_buy_won_pnl.sql`).
- BUY LOST: `pnl = -size`.
- Realized P&L uses each order’s stored `pnl` from the resolve step; no recomputation on the wallet detail API.

### 3.3 Size column empty

- `ft_orders.size` is DECIMAL and can be **NULL** (e.g. legacy or bad sync).
- Frontend uses `formatCurrency(trade.size)`. If `size` is null/undefined, that can render as blank or NaN.
- **Recommendation:** Show “–” (or “$0.00”) when `size` is null/undefined so the column is never blank in a confusing way.

### 3.4 Consistency of counts

- `total_trades` = all orders (open + resolved).
- `open_positions` = orders with `outcome === 'OPEN'`.
- Resolved count = `won + lost` = number of orders with outcome WON or LOST.
- So: `total_trades === open_positions + (won + lost)` for that wallet. If this ever fails, that would indicate a bug (e.g. another outcome value).

---

## 4. Recommendations (implemented or suggested)

1. **UI copy:** Make it explicit that the table is “Last 50 of [N] resolved trades” and that Realized P&L is from all N. (Implemented in FT detail page.)
2. **Sum of visible:** Show “Sum of visible: $X.XX” under the Recent Trades table so users can sanity-check the 50 rows. (Implemented.)
3. **Size column:** If `size` is null/undefined, display “–” (or “$0.00”) instead of calling `formatCurrency` on a non-number. (Implemented.)
4. **Optional:** Add pagination or “Export all resolved” so users can see or sum all resolved trades when N > 50.

---

## 5. Data verification (script run)

A data audit was run against the live DB via `scripts/audit-ft-realized-pnl-data.ts`:

- **All wallets with resolved orders:** For each wallet, the script loads all `ft_orders` (paginated), computes realized PnL as the sum of `pnl` over all resolved orders, and the sum of the first 50 (by `order_time` desc). It also checks for null `pnl`, null `size`, and unexpected `outcome` values.
- **Result:** No data issues found. No resolved orders with null `pnl` or null `size`; no outcome values other than OPEN/WON/LOST. For wallets with ≤50 resolved, the sum of “first 50” equals total realized PnL; for wallets with >50 resolved, the difference is exactly the contribution of the older resolved trades not shown in the table.
- **Example (FT_ML_EDGE):** 126 resolved, realized PnL from DB = $544.01, sum of first 50 = $49.79 — matches the UI behavior (Realized P&L card = all 126, Recent Trades table = last 50).

Re-run anytime: `npx tsx scripts/audit-ft-realized-pnl-data.ts` or `npx tsx scripts/audit-ft-realized-pnl-data.ts <wallet_id>`.

---

## 6. Files touched

- `app/api/ft/wallets/[id]/route.ts` – Defines realized P&L (all resolved) and recent_trades (slice 0–50).
- `app/ft/[id]/page.tsx` – Recent Trades tab: copy, sum of visible, and null-safe Size.
- `app/api/ft/resolve/route.ts` – WON/LOST and `pnl` computation.
- `docs/audits/PNL_AUDIT_REPORT.md` – Documents the BUY WON fix.
- `scripts/audit-ft-realized-pnl-data.ts` – Data audit script (DB verification).
