-- Migration: Create CLOB Credentials Table
-- Purpose: Store encrypted Polymarket CLOB API credentials for L2 trading
-- Security: Secrets and passphrases are encrypted, only api_key is stored in plaintext

-- Drop table if it exists (clean slate)
DROP TABLE IF EXISTS clob_credentials CASCADE;

-- Create the table
CREATE TABLE clob_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  polymarket_account_address text NOT NULL,
  turnkey_address text NOT NULL,
  
  -- CLOB credentials (api_key is ok to show, others must be encrypted)
  api_key text NOT NULL,
  api_secret_encrypted text NOT NULL,
  api_passphrase_encrypted text NOT NULL,
  
  -- Metadata
  validated boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  last_validated_at timestamptz,
  
  -- Constraints
  CONSTRAINT clob_credentials_user_account_unique UNIQUE(user_id, polymarket_account_address)
);

-- Add indexes
CREATE INDEX idx_clob_credentials_user_id ON clob_credentials(user_id);
CREATE INDEX idx_clob_credentials_account ON clob_credentials(polymarket_account_address);

-- Add comments
COMMENT ON TABLE clob_credentials IS 'Stores encrypted Polymarket CLOB L2 API credentials for trading';
COMMENT ON COLUMN clob_credentials.api_secret_encrypted IS 'Encrypted API secret - never expose to client';
COMMENT ON COLUMN clob_credentials.api_passphrase_encrypted IS 'Encrypted API passphrase - never expose to client';

-- Enable RLS
ALTER TABLE clob_credentials ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Users can view own CLOB credentials" ON clob_credentials;
DROP POLICY IF EXISTS "Users can insert own CLOB credentials" ON clob_credentials;
DROP POLICY IF EXISTS "Users can update own CLOB credentials" ON clob_credentials;

-- Create RLS policies
CREATE POLICY "Users can view own CLOB credentials"
  ON clob_credentials
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own CLOB credentials"
  ON clob_credentials
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own CLOB credentials"
  ON clob_credentials
  FOR UPDATE
  USING (user_id = auth.uid());
