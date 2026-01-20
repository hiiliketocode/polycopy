-- Materialized rankings for realized P&L windows
-- Computes per-wallet realized P&L totals and ranks by window.

create materialized view wallet_realized_pnl_rankings as
with stats as (
  select
    max(date) as anchor_date,
    min(date) as min_date
  from wallet_realized_pnl_daily
),
windows as (
  select '1D'::text as window_key, anchor_date as window_start, anchor_date as window_end from stats
  union all
  select '7D'::text, anchor_date - 6, anchor_date from stats
  union all
  select '30D'::text, anchor_date - 29, anchor_date from stats
  union all
  select '3M'::text, anchor_date - 89, anchor_date from stats
  union all
  select '6M'::text, anchor_date - 179, anchor_date from stats
  union all
  select 'ALL'::text, min_date, anchor_date from stats
),
aggregated as (
  select
    w.window_key,
    d.wallet_address,
    w.window_start,
    w.window_end,
    sum(d.realized_pnl) as pnl_sum
  from wallet_realized_pnl_daily d
  cross join windows w
  where (w.window_start is null or d.date >= w.window_start)
    and (w.window_end is null or d.date <= w.window_end)
  group by w.window_key, d.wallet_address, w.window_start, w.window_end
)
select
  window_key,
  wallet_address,
  window_start,
  window_end,
  pnl_sum,
  rank() over (partition by window_key order by pnl_sum desc) as rank
from aggregated;

create unique index wallet_realized_pnl_rankings_wallet_window
  on wallet_realized_pnl_rankings (window_key, wallet_address);

create index wallet_realized_pnl_rankings_window_rank
  on wallet_realized_pnl_rankings (window_key, rank);
