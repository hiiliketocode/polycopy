-- Migration: 022_rename_orders_to_trades
-- Purpose: Rename orders table to trades and update foreign keys/indexes

-- Rename table
ALTER TABLE IF EXISTS orders RENAME TO trades;

-- Rename indexes if they exist
ALTER INDEX IF EXISTS idx_orders_trader_created_at RENAME TO idx_trades_trader_created_at;
ALTER INDEX IF EXISTS idx_orders_market RENAME TO idx_trades_market;
ALTER INDEX IF EXISTS idx_orders_status RENAME TO idx_trades_status;

-- Update foreign key on fills.order_id to point to trades
DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT tc.constraint_name
  INTO constraint_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
   AND tc.table_schema = kcu.table_schema
  WHERE tc.table_name = 'fills'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND kcu.column_name = 'order_id'
  LIMIT 1;

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE fills DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE fills
  ADD CONSTRAINT fills_order_id_fkey
  FOREIGN KEY (order_id)
  REFERENCES trades(order_id)
  ON DELETE CASCADE;

-- RLS remains enabled from previous migration; no policy changes needed.
