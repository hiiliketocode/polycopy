-- Turnkey wallet storage
CREATE TABLE IF NOT EXISTS turnkey_wallets (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  turnkey_sub_org_id text NOT NULL,
  turnkey_wallet_id text NOT NULL,
  turnkey_private_key_id text NOT NULL,
  eoa_address text NOT NULL, -- The Magic EOA
  polymarket_account_address text NOT NULL, -- The Magic proxy wallet
  wallet_type text DEFAULT 'magic_proxy',
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  UNIQUE(user_id),
  UNIQUE(eoa_address)
);

-- L2 credentials storage
CREATE TABLE IF NOT EXISTS clob_credentials (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  turnkey_wallet_id uuid REFERENCES turnkey_wallets(id) ON DELETE CASCADE,
  api_key text NOT NULL,
  secret_ciphertext text NOT NULL,
  passphrase_ciphertext text NOT NULL,
  created_at timestamp DEFAULT now(),
  last_validated_at timestamp,
  UNIQUE(turnkey_wallet_id)
);

-- Order tracking (for future use)
CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  turnkey_wallet_id uuid REFERENCES turnkey_wallets(id) ON DELETE CASCADE,
  market_id text NOT NULL,
  token_id text NOT NULL,
  side text NOT NULL, -- 'BUY' or 'SELL'
  price numeric NOT NULL,
  size numeric NOT NULL,
  order_type text NOT NULL,
  copied_from_trader text, -- Address of trader being copied
  copied_trade_id text,
  idempotency_key text UNIQUE,
  clob_order_id text,
  status text DEFAULT 'PENDING', -- PENDING, OPEN, FILLED, etc.
  filled_size numeric,
  rejection_reason text,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS turnkey_wallets_user_id_idx ON turnkey_wallets(user_id);
CREATE INDEX IF NOT EXISTS turnkey_wallets_eoa_address_idx ON turnkey_wallets(eoa_address);
CREATE INDEX IF NOT EXISTS clob_credentials_turnkey_wallet_id_idx ON clob_credentials(turnkey_wallet_id);
CREATE INDEX IF NOT EXISTS orders_user_id_idx ON orders(user_id);
CREATE INDEX IF NOT EXISTS orders_turnkey_wallet_id_idx ON orders(turnkey_wallet_id);
CREATE INDEX IF NOT EXISTS orders_status_idx ON orders(status);

-- RLS Policies
ALTER TABLE turnkey_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE clob_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Users can only see their own Turnkey wallets
CREATE POLICY "Users can view own turnkey wallets"
  ON turnkey_wallets FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own turnkey wallets"
  ON turnkey_wallets FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own turnkey wallets"
  ON turnkey_wallets FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can only see their own CLOB credentials
CREATE POLICY "Users can view own clob credentials"
  ON clob_credentials FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM turnkey_wallets
      WHERE turnkey_wallets.id = clob_credentials.turnkey_wallet_id
      AND turnkey_wallets.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own clob credentials"
  ON clob_credentials FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM turnkey_wallets
      WHERE turnkey_wallets.id = clob_credentials.turnkey_wallet_id
      AND turnkey_wallets.user_id = auth.uid()
    )
  );

-- Users can only see their own orders
CREATE POLICY "Users can view own orders"
  ON orders FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own orders"
  ON orders FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own orders"
  ON orders FOR UPDATE
  USING (auth.uid() = user_id);


