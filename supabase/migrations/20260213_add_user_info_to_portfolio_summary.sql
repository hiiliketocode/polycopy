-- =============================================================================
-- ADD email, is_premium, wallet_imported TO user_portfolio_summary
-- =============================================================================
-- Adds user-level info columns so the portfolio summary table can be queried
-- without joining profiles / turnkey_wallets every time.
-- =============================================================================

-- 1. Add the new columns
ALTER TABLE public.user_portfolio_summary
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS is_premium BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS wallet_imported BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Backfill email + is_premium from profiles
UPDATE public.user_portfolio_summary ups
SET
  email       = p.email,
  is_premium  = COALESCE(p.is_premium, FALSE)
FROM public.profiles p
WHERE p.id = ups.user_id;

-- 3. Backfill wallet_imported from turnkey_wallets
--    A user counts as "wallet imported" if they have at least one
--    turnkey_wallets row with wallet_type = 'imported_magic'.
UPDATE public.user_portfolio_summary ups
SET wallet_imported = TRUE
WHERE EXISTS (
  SELECT 1
  FROM public.turnkey_wallets tw
  WHERE tw.user_id = ups.user_id
    AND tw.wallet_type = 'imported_magic'
);

-- 4. Add comments for documentation
COMMENT ON COLUMN public.user_portfolio_summary.email IS
  'User email copied from profiles for convenience querying.';
COMMENT ON COLUMN public.user_portfolio_summary.is_premium IS
  'Whether the user has an active premium subscription (from profiles.is_premium).';
COMMENT ON COLUMN public.user_portfolio_summary.wallet_imported IS
  'Whether the user has imported a Polymarket wallet (turnkey_wallets.wallet_type = imported_magic).';

-- 5. Replace the upsert function so it auto-populates the new columns
CREATE OR REPLACE FUNCTION public.upsert_user_portfolio_summary(
  p_user_id UUID,
  p_total_pnl NUMERIC,
  p_realized_pnl NUMERIC,
  p_unrealized_pnl NUMERIC,
  p_total_volume NUMERIC,
  p_roi NUMERIC,
  p_win_rate NUMERIC,
  p_total_trades INTEGER,
  p_total_buy_trades INTEGER,
  p_total_sell_trades INTEGER,
  p_open_positions INTEGER,
  p_closed_positions INTEGER,
  p_winning_positions INTEGER,
  p_losing_positions INTEGER,
  p_calculation_version INTEGER DEFAULT 1
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_email TEXT;
  v_is_premium BOOLEAN;
  v_wallet_imported BOOLEAN;
BEGIN
  -- Look up user info from profiles
  SELECT p.email, COALESCE(p.is_premium, FALSE)
  INTO v_email, v_is_premium
  FROM public.profiles p
  WHERE p.id = p_user_id;

  -- Check for imported wallet
  SELECT EXISTS (
    SELECT 1
    FROM public.turnkey_wallets tw
    WHERE tw.user_id = p_user_id
      AND tw.wallet_type = 'imported_magic'
  ) INTO v_wallet_imported;

  INSERT INTO public.user_portfolio_summary (
    user_id,
    email,
    is_premium,
    wallet_imported,
    total_pnl,
    realized_pnl,
    unrealized_pnl,
    total_volume,
    roi,
    win_rate,
    total_trades,
    total_buy_trades,
    total_sell_trades,
    open_positions,
    closed_positions,
    winning_positions,
    losing_positions,
    calculated_at,
    last_updated_at,
    calculation_version
  )
  VALUES (
    p_user_id,
    v_email,
    COALESCE(v_is_premium, FALSE),
    COALESCE(v_wallet_imported, FALSE),
    p_total_pnl,
    p_realized_pnl,
    p_unrealized_pnl,
    p_total_volume,
    p_roi,
    p_win_rate,
    p_total_trades,
    p_total_buy_trades,
    p_total_sell_trades,
    p_open_positions,
    p_closed_positions,
    p_winning_positions,
    p_losing_positions,
    NOW(),
    NOW(),
    p_calculation_version
  )
  ON CONFLICT (user_id) DO UPDATE SET
    email = EXCLUDED.email,
    is_premium = EXCLUDED.is_premium,
    wallet_imported = EXCLUDED.wallet_imported,
    total_pnl = EXCLUDED.total_pnl,
    realized_pnl = EXCLUDED.realized_pnl,
    unrealized_pnl = EXCLUDED.unrealized_pnl,
    total_volume = EXCLUDED.total_volume,
    roi = EXCLUDED.roi,
    win_rate = EXCLUDED.win_rate,
    total_trades = EXCLUDED.total_trades,
    total_buy_trades = EXCLUDED.total_buy_trades,
    total_sell_trades = EXCLUDED.total_sell_trades,
    open_positions = EXCLUDED.open_positions,
    closed_positions = EXCLUDED.closed_positions,
    winning_positions = EXCLUDED.winning_positions,
    losing_positions = EXCLUDED.losing_positions,
    last_updated_at = NOW(),
    calculation_version = EXCLUDED.calculation_version;
END;
$$;
