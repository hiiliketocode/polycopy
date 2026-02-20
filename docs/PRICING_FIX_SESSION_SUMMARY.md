# Pricing Fix Session Summary — Feb 19, 2026

## Root Cause

**The Polymarket Gamma API returns completely wrong markets for many newer condition_ids.**

When querying `gamma-api.polymarket.com/markets?condition_id=X`, Gamma sometimes returns a totally different market (e.g., returns "Will Joe Biden get Coronavirus?" — a 2020 market — when asked for a 2026 LoL esports market). The returned `conditionId` doesn't match the queried one, but no code validated this.

The wrong data — outcomes `["Yes","No"]`, prices `[0,0]`, `closed: true` — was then written to the `markets` table under the **correct** condition_id via multiple write paths (Price API, portfolio/trades, orders). This corrupted **207 out of 674 open-order markets (31%)**.

### How it cascaded

| System | Symptom | Mechanism |
|--------|---------|-----------|
| **v2 Portfolio** | Entry = Current, 0% P&L | Outcome "COLOSSAL GAMING" couldn't match corrupted `["Yes","No"]` → null → fallback to entry price |
| **FT wallets** | <1¢ current price | Corrupted prices `[0,0]` → `formatPriceCents(0)` → "<1¢" |
| **LT live-prices** | 50¢ for everything | Route couldn't parse `{ outcomes, outcomePrices }` format → fell to Gamma → wrong data → `Number(0) \|\| 0.5` = 50¢ |
| **Portfolio Resolved tab** | Open trades shown as Resolved | Corrupted `closed: true` written to markets table → orders marked `market_resolved: true` → trades appeared in wrong tab with $0 price |

### Timeline

The corruption was introduced by commit `58a3908` on Feb 18 which migrated the orders route from **CLOB** (always correct) to **Gamma** (returns wrong data for newer markets) without conditionId validation. Every subsequent page load amplified the corruption as more routes read/wrote wrong data.

---

## Fixes Deployed (11 commits)

### Critical — Gamma Validation

| # | Fix | Files | Impact |
|---|-----|-------|--------|
| 1 | **Validate Gamma conditionId** — skip to CLOB when mismatched | `price/route.ts`, `gamma.ts` | Prevents all future data corruption |
| 2 | **Empty stubs for skipped markets** — so CLOB enrichment fills them | `orders/route.ts` | Orders API returns real prices instead of null |
| 3 | **LT live-prices format fix** — parse `{ outcomes, outcomePrices }` | `lt/live-prices/route.ts`, `lt/strategies/route.ts` | LT/FT pages show real prices instead of 50¢ |

### Data Cleanup

| # | Fix | Scope |
|---|-----|-------|
| 4 | **Markets table** — re-fetched from CLOB for all 674 open markets | 207 corrupted rows fixed |
| 5 | **Wrongly-resolved orders** — reset `market_resolved` and `current_price` | 148 orders fixed |
| 6 | **Market status contradiction** — `closed: false` but `status: 'resolved'` | 59 markets fixed |

### Write Protection

| # | Fix | Files |
|---|-----|-------|
| 7 | **Portfolio/trades write guard** — validate conditionId before DB write, skip zero prices | `portfolio/trades/route.ts` |
| 8 | **FT wallets** — reject 0.5 placeholder from cache | `ft/wallets/[id]/route.ts` |
| 9 | **Removed `status === 'resolved'` check** — only `closed` boolean determines resolution | `portfolio/trades/route.ts` |

### Portfolio UX

| # | Fix | Files |
|---|-----|-------|
| 10 | **Pagination** — 500 → 5,000 trades (was only showing most recent 500) | `v2/portfolio/page.tsx`, `portfolio/page.tsx` |
| 11 | **Sold tab detection** — detect sells from CLOB order data | `v2/portfolio/page.tsx` |
| 12 | **Arrow display** — `whitespace-nowrap` on Entry→Current | `v2/portfolio/page.tsx` |
| 13 | **Null crash fix** — `market_title?.toLowerCase()` | `portfolio/page.tsx` |
| 14 | **Performance** — price cache 15s→60s, timeout 8s→4s, progressive UI | `portfolio/trades/route.ts` |

### Ad-hoc

| # | Fix | Details |
|---|-----|---------|
| 15 | **Rogue LT order** — Logan Paul $7,855 phantom trade cancelled | `lt_orders` table — CLOB returned 404 for the order_id, FT source was only $8 |

---

## Outstanding Issues

### Portfolio Screen

| Priority | Issue | Details |
|----------|-------|---------|
| **High** | P&L accuracy (+$6,136) | Stats API uses Polymarket official P&L + FIFO cost basis. May be correct but hasn't been validated against actual Polymarket account balance. Need to cross-reference. |
| **High** | Trade loading speed | Loading 3,679 trades in background still takes 30-60s. Each page triggers up to 30 price lookups. First page appears fast but full dataset is slow. |
| **Medium** | Total Trades shows 1,000 | Stats API counts ~1,000 but DB has 3,801 orders. Likely deduplication (grouping by market+outcome into positions). May be correct but needs documentation. |
| **Medium** | Sold tab completeness | Detects sells from `/api/orders` response. Sells made directly on Polymarket.com that aren't in the CLOB orders response won't appear. Needs a cron to check position changes. |
| **Medium** | Resolved trades missing wins | Some resolved trades show $0 because `resolved_outcome` is null. The resolution sync cron may need to run more frequently. |
| **Low** | Crypto Up/Down still show as Open | Short-duration resolved markets (e.g., 5-min ETH bets) have `market_resolved: false` in orders because no sync updated them. Needs periodic resolution status check. |

### Other Screens

| Priority | Issue | Details |
|----------|-------|---------|
| **Medium** | `\|\| 0.5` pattern in 4 routes | `ft/sync`, `ft/enrich-ml`, `paper-trading`, `lt/force-test-trade` still default to 50¢ when price is 0 or NaN. Should use `Number.isFinite(p) ? p : 0`. |
| **Low** | LT pages require admin | `/lt/[id]` returns "Access denied" for non-admin. By design but may confuse users. |

---

## Architectural Lessons

1. **Never trust Gamma for newer markets.** Gamma's `condition_id` search returns wrong results for many condition_ids. CLOB is the only reliable source. Consider deprecating all direct Gamma calls for pricing and using CLOB as the primary source everywhere.

2. **Always validate external API responses.** The conditionId mismatch was trivial to catch but caused cascading corruption because no caller validated the response.

3. **Don't use `|| 0.5` as a price default.** Resolved markets legitimately have price = 0 (losing side). `Number(0) || 0.5` silently turns losses into 50¢ placeholders. Use `Number.isFinite(p) ? p : null` instead.

4. **The `markets` table is a shared resource.** Multiple routes write to it (Price API, portfolio/trades, FT wallets, orders enrichment). One route writing wrong data corrupts all consumers. Write protection (validation before upsert) is essential.

5. **Pagination matters for heavy users.** A 500-trade cap works for casual users but breaks for power users. The pagination should be driven by actual data volume, not an arbitrary constant.
