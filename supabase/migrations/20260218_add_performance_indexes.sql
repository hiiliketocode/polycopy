-- Performance indexes to reduce CPU/Disk IO pressure
-- Addresses missing indexes on frequently queried columns

-- orders.copy_user_id: used by portfolio stats, sync-polymarket-pnl, and many user-facing queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_copy_user_id
  ON orders (copy_user_id);

-- Composite for the most common orders query pattern: user's orders by status, newest first
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_copy_user_status_created
  ON orders (copy_user_id, status, created_at DESC);

-- Partial index for refresh-copy-pnl: orders needing price refresh
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_needs_price_refresh
  ON orders (market_id)
  WHERE user_exit_price IS NULL AND market_id IS NOT NULL;

-- ft_orders.resolved_time: used for daily PnL calculations
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ft_orders_resolved_time
  ON ft_orders (resolved_time);

-- Composite for resolved trades queries (wallet + outcome + time)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ft_orders_wallet_outcome_resolved
  ON ft_orders (wallet_id, outcome, resolved_time);

-- Partial index for OPEN ft_orders (used by ft-snapshot, lt-execute)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ft_orders_open
  ON ft_orders (wallet_id)
  WHERE outcome = 'OPEN';
