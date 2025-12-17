-- Update turnkey_wallets to allow nullable fields for MVP wallet creation
-- These fields are not needed for Turnkey-managed wallets (only for imported keys)

ALTER TABLE turnkey_wallets 
  ALTER COLUMN turnkey_private_key_id DROP NOT NULL,
  ALTER COLUMN polymarket_account_address DROP NOT NULL;

-- Update comments to clarify usage
COMMENT ON COLUMN turnkey_wallets.turnkey_private_key_id IS 
  'Private key ID - only used for imported keys, NULL for Turnkey-managed wallets';

COMMENT ON COLUMN turnkey_wallets.polymarket_account_address IS 
  'Polymarket proxy address - only relevant for imported Magic wallets, empty for Turnkey-managed wallets';

COMMENT ON COLUMN turnkey_wallets.wallet_type IS 
  'Wallet type: "magic_proxy" for imported Magic wallets, "turnkey_managed" for Turnkey-created wallets';


