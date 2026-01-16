-- EXPORT TRADES FOR BACKUP - Before archiving/deleting
-- Use this to export trades data to CSV for backup

-- Option 1: Export all trades to CSV (run in Supabase SQL Editor, then download)
COPY (
  SELECT * FROM public.trades
  ORDER BY created_at DESC
) TO STDOUT WITH CSV HEADER;

-- Option 2: Export only old trades (to reduce export size)
COPY (
  SELECT * FROM public.trades
  WHERE created_at < NOW() - INTERVAL '30 days'
  ORDER BY created_at DESC
) TO STDOUT WITH CSV HEADER;

-- Note: In Supabase SQL Editor, you may need to use:
-- SELECT * FROM public.trades WHERE created_at < NOW() - INTERVAL '30 days';
-- Then use the "Download as CSV" button
