-- Add encryption key metadata to clob_credentials for key rotation
ALTER TABLE clob_credentials
  ADD COLUMN IF NOT EXISTS enc_kid text NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS enc_version integer NOT NULL DEFAULT 1;

COMMENT ON COLUMN clob_credentials.enc_kid IS 'Encryption key identifier used for api_secret_encrypted/api_passphrase_encrypted';
COMMENT ON COLUMN clob_credentials.enc_version IS 'Encryption scheme version - reserved for future upgrades';
