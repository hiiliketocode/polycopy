-- Migration: Enable RLS on security-critical tables
-- Created: 2024-12-24
-- Description: Fix security vulnerabilities by enabling RLS on clob_credentials, 
--              turnkey_wallets, trades_public, and metric_definitions

-- ====================================
-- CLOB_CREDENTIALS
-- ====================================

ALTER TABLE clob_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own clob credentials"
ON clob_credentials
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own clob credentials"
ON clob_credentials
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own clob credentials"
ON clob_credentials
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own clob credentials"
ON clob_credentials
FOR DELETE
USING (auth.uid() = user_id);

-- ====================================
-- TURNKEY_WALLETS
-- ====================================

ALTER TABLE turnkey_wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own wallet"
ON turnkey_wallets
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own wallet"
ON turnkey_wallets
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own wallet"
ON turnkey_wallets
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own wallet"
ON turnkey_wallets
FOR DELETE
USING (auth.uid() = user_id);

-- ====================================
-- TRADES_PUBLIC (Public read-only)
-- ====================================

ALTER TABLE trades_public ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read public trades"
ON trades_public
FOR SELECT
USING (true);

-- ====================================
-- METRIC_DEFINITIONS (Public read-only)
-- ====================================

ALTER TABLE metric_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read metric definitions"
ON metric_definitions
FOR SELECT
USING (true);

