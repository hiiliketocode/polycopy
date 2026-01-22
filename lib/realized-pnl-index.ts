import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const safeNumber = (value: any) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

export type RealizedIndexSeriesEntry = {
  date: string;
  total_realized_pnl: number;
  average_realized_pnl: number;
  cumulative_realized_pnl: number;
  cumulative_average_pnl: number;
};

export type RealizedIndexWindow = {
  window_key: string;
  lookback_days: number | null;
  start_date: string;
  wallet_count: number;
  total_realized_pnl: number;
  average_realized_pnl: number;
  cumulative_realized_pnl: number;
  cumulative_average_pnl: number;
  as_of: string;
};

export async function loadTopRealizedIndexPayload(): Promise<{
  series: RealizedIndexSeriesEntry[];
  windows: RealizedIndexWindow[];
  latestAsOf?: string;
  error?: string;
}> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return { series: [], windows: [], error: 'Missing Supabase configuration for realized index' };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const { data: dailyRows, error: dailyError } = await supabase
      .from('top30_realized_pnl_daily')
      .select(
        'date, wallet_count, total_realized_pnl, average_realized_pnl, cumulative_realized_pnl, cumulative_average_pnl'
      )
      .order('date', { ascending: true });

    if (dailyError) {
      return { series: [], windows: [], error: dailyError.message };
    }

    const series = (dailyRows ?? [])
      .filter(Boolean)
      .map((row: any) => ({
        date: row.date,
        total_realized_pnl: safeNumber(row.total_realized_pnl),
        average_realized_pnl: safeNumber(row.average_realized_pnl),
        cumulative_realized_pnl: safeNumber(row.cumulative_realized_pnl),
        cumulative_average_pnl: safeNumber(row.cumulative_average_pnl),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const { data: windowRows, error: windowError } = await supabase
      .from('top30_realized_pnl_windows')
      .select(
        'window_key, lookback_days, start_date, wallet_count, total_realized_pnl, average_realized_pnl, cumulative_realized_pnl, cumulative_average_pnl, as_of'
      )
      .order('as_of', { ascending: false });

    if (windowError) {
      return { series, windows: [], error: windowError.message };
    }

    const sortedWindows = (windowRows ?? []).filter((row: any) => Boolean(row.window_key));
    const latestAsOf = sortedWindows[0]?.as_of ?? null;
    const windows = sortedWindows
      .filter((row: any) => row.as_of === latestAsOf)
      .map((row: any) => ({
        window_key: row.window_key,
        lookback_days: row.lookback_days,
        start_date: row.start_date,
        wallet_count: safeNumber(row.wallet_count),
        total_realized_pnl: safeNumber(row.total_realized_pnl),
        average_realized_pnl: safeNumber(row.average_realized_pnl),
        cumulative_realized_pnl: safeNumber(row.cumulative_realized_pnl),
        cumulative_average_pnl: safeNumber(row.cumulative_average_pnl),
        as_of: row.as_of,
      }));

    return { series, windows, latestAsOf: latestAsOf ?? undefined };
  } catch (error) {
    console.error('[Realized Index] Failed to load payload', error);
    return { series: [], windows: [], error: error instanceof Error ? error.message : 'Failed to load index data' };
  }
}
