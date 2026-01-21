-- Restrict access to wallet_realized_pnl_rankings materialized view
-- Note: RLS cannot be enabled on materialized views, so we revoke public access instead
-- The API will access it using the service role key

-- Revoke all public access to the materialized view
REVOKE ALL ON wallet_realized_pnl_rankings FROM PUBLIC;
REVOKE ALL ON wallet_realized_pnl_rankings FROM anon;
REVOKE ALL ON wallet_realized_pnl_rankings FROM authenticated;

-- Grant SELECT to the service role only (used by API endpoints)
GRANT SELECT ON wallet_realized_pnl_rankings TO service_role;

-- Grant SELECT to postgres role (for admin access and cron jobs)
GRANT SELECT ON wallet_realized_pnl_rankings TO postgres;

-- Note: The materialized view is refreshed by a cron job that runs as postgres/service_role
-- API endpoints use the service role key to query this data and return it to clients
