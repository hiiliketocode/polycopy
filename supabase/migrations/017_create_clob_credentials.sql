-- Migration: Create CLOB Credentials Table
-- Purpose: Store encrypted Polymarket CLOB API credentials for L2 trading
-- Security: Secrets and passphrases are encrypted, only api_key is stored in plaintext

CREATE TABLE IF NOT EXISTS clob_credentials (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  polymarket_account_address text NOT NULL, -- The Safe/proxy wallet address
  turnkey_address text NOT NULL, -- The Turnkey EOA that signed the auth
  
  -- CLOB credentials (api_key is ok to show, others must be encrypted)
  api_key text NOT NULL,
  api_secret_encrypted text NOT NULL, -- Encrypted using Supabase vault
  api_passphrase_encrypted text NOT NULL, -- Encrypted using Supabase vault
  
  -- Metadata
  validated boolean DEFAULT false, -- Whether credentials were validated after creation
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  last_validated_at timestamp,
  
  -- Constraints
  UNIQUE(user_id, polymarket_account_address) -- One set of credentials per user+account
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_clob_credentials_user_id ON clob_credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_clob_credentials_account ON clob_credentials(polymarket_account_address);

-- RLS policies
ALTER TABLE clob_credentials ENABLE ROW LEVEL SECURITY;

-- Users can only see their own credentials
CREATE POLICY "Users can view own CLOB credentials"
  ON clob_credentials FOR SELECT
  USING (auth.uid() = clob_credentials.user_id);

-- Users can insert their own credentials
CREATE POLICY "Users can insert own CLOB credentials"
  ON clob_credentials FOR INSERT
  WITH CHECK (auth.uid() = clob_credentials.user_id);

-- Users can update their own credentials
CREATE POLICY "Users can update own CLOB credentials"
  ON clob_credentials FOR UPDATE
  USING (auth.uid() = clob_credentials.user_id);

COMMENT ON TABLE clob_credentials IS 'Stores encrypted Polymarket CLOB L2 API credentials for trading';
COMMENT ON COLUMN clob_credentials.api_secret_encrypted IS 'Encrypted API secret - never expose to client';
COMMENT ON COLUMN clob_credentials.api_passphrase_encrypted IS 'Encrypted API passphrase - never expose to client';

