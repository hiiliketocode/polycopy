/**
 * Legacy Dome module - only pickMarketStartTime and pickMarketEndTime remain.
 * Market fetching has been migrated to lib/markets/gamma.ts.
 */

export const pickMarketStartTime = (row: Record<string, any> | null | undefined) => {
  // ONLY use game_start_time from markets table, no fallback to start_time
  // Supabase converts snake_case to camelCase, so check both
  if (!row) return null;
  const raw = row.game_start_time || row.gameStartTime || null;
  if (!raw) return null;
  // If it's already an ISO string, return as-is
  if (typeof raw === 'string' && raw.includes('T')) {
    // Ensure it's a valid ISO string (add Z if missing timezone)
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  // If it's a PostgreSQL timestamp format (e.g., "2026-01-25 20:00:00+00"), convert to ISO
  if (typeof raw === 'string') {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return null;
};

export const pickMarketEndTime = (row: Record<string, any> | null | undefined) => {
  // Use end_time (actual resolution date) for the "Resolves" badge
  // - end_time: When the market resolves (what the badge should show)
  // - close_time: When betting/trading stops (may be earlier than resolution)
  // For political markets like "X by March 31?", close_time may be Jan 31 but end_time is March 31
  // Supabase converts snake_case to camelCase, so check both
  if (!row) return null;
  return row.end_time || row.endTime || row.close_time || row.closeTime || null;
};
