create table if not exists public.wallet_backfill_status (
  wallet_address text primary key,
  earliest_trade_ts timestamptz,
  latest_trade_ts timestamptz,
  backfilled_until_ts timestamptz,
  last_ingested_trade_ts timestamptz,
  trade_count bigint,
  existing_trade_count bigint,
  new_trades_added bigint,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'completed', 'failed')),
  updated_at timestamptz not null default now(),
  last_backfill_run_at timestamptz
);

create index if not exists wallet_backfill_status_status_idx
  on public.wallet_backfill_status (status, updated_at desc);

alter table public.wallet_backfill_status
  add column if not exists earliest_trade_ts timestamptz,
  add column if not exists latest_trade_ts timestamptz,
  add column if not exists backfilled_until_ts timestamptz,
  add column if not exists last_ingested_trade_ts timestamptz,
  add column if not exists trade_count bigint,
  add column if not exists existing_trade_count bigint,
  add column if not exists new_trades_added bigint,
  add column if not exists status text,
  add column if not exists updated_at timestamptz,
  add column if not exists last_backfill_run_at timestamptz;

alter table public.wallet_backfill_status
  alter column status set default 'pending';

update public.wallet_backfill_status
set status = 'pending'
where status is null;
