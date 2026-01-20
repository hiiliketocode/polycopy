-- Schedule daily refresh for wallet_realized_pnl_rankings materialized view

create extension if not exists pg_cron;

create or replace function refresh_wallet_realized_pnl_rankings()
returns void
language plpgsql
security definer
as $$
begin
  refresh materialized view concurrently wallet_realized_pnl_rankings;
end;
$$;

-- Replace any existing job with the same name
DO $$
begin
  if exists (select 1 from cron.job where jobname = 'refresh_wallet_realized_pnl_rankings_daily') then
    perform cron.unschedule(jobid)
    from cron.job
    where jobname = 'refresh_wallet_realized_pnl_rankings_daily';
  end if;
exception
  when undefined_table then
    -- cron.job not available
    null;
end;
$$;

select cron.schedule(
  'refresh_wallet_realized_pnl_rankings_daily',
  '0 3 * * *',
  $$select refresh_wallet_realized_pnl_rankings();$$
);
