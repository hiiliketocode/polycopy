# Polymarket L2 Credentials - Implementation Summary

## Problem

Generate Polymarket CLOB L2 API credentials for users with imported Magic Link private keys (EOA) that control proxy/Safe wallets on Polymarket.

## Solution

### Authentication Model

**For imported Magic Link wallets (wallet_type='imported_magic'):**

1. **EOA (Externally Owned Account)**: The imported private key stored in Turnkey
   - Used for authentication (POLY_ADDRESS header and EIP-712 signing)
   - Address: `eoa_address` from `turnkey_wallets`

2. **Proxy Wallet**: The Safe/custom wallet that holds funds on Polymarket
   - Linked via `funder` parameter in ClobClient
   - Address: `polymarket_account_address` from `turnkey_wallets`

3. **Signature Type**: `2` (GNOSIS_SAFE)
   - Most common for proxy wallets per Polymarket docs
   - POLY_PROXY (1) is specifically for wallets exported directly from Polymarket.com

### Key Implementation Details

#### TurnkeySigner (lib/polymarket/turnkey-signer.ts)

- Implements ethers Signer interface for Turnkey
- `getAddress()` returns EOA address
- `_signTypedData()` uses Turnkey to sign with EOA private key
- EIP-712 message format:
  ```typescript
  {
    address: eoaAddress,  // EOA that signs
    timestamp: string,
    nonce: number,
    message: "This message attests that I control the given wallet"
  }
  ```

#### ClobClient Configuration (lib/polymarket/clob.ts)

```typescript
new ClobClient(
  host,
  chainId,
  signer,           // EOA signer
  undefined,        // No API creds for L1 auth
  2,                // GNOSIS_SAFE signature type
  proxyAddress      // Proxy wallet as funder
)
```

#### API Endpoint (app/api/polymarket/l2-credentials/route.ts)

1. Authenticate user via Supabase
2. Load wallet mapping from `turnkey_wallets`
3. Create Turnkey signer with EOA
4. Call Polymarket CLOB with signature type 2 and proxy as funder
5. Store encrypted credentials in `clob_credentials`
6. Perform smoke test to verify credentials work

### Database Schema

**turnkey_wallets:**
- `eoa_address`: EOA signing key (for authentication)
- `polymarket_account_address`: Proxy wallet (holds funds)
- `turnkey_private_key_id`: Reference to private key in Turnkey
- `wallet_type`: 'imported_magic' for Magic Link imports

**clob_credentials:**
- `api_key`: Polymarket API key (public)
- `api_secret_encrypted`: Encrypted API secret
- `api_passphrase_encrypted`: Encrypted API passphrase
- `validated`: Boolean indicating smoke test passed

### What Was Wrong Initially

1. ❌ Attempted to use proxy address for POLY_ADDRESS header
   - CLOB client uses `signer.getAddress()` for POLY_ADDRESS
   - Must return EOA for authentication

2. ❌ Attempted to override `signer.getAddress()` to return proxy
   - Caused EIP-712 message to contain proxy address
   - Signature verification failed (EOA signed message with proxy address)

3. ❌ Used signature type 1 (POLY_PROXY) instead of 2 (GNOSIS_SAFE)
   - POLY_PROXY is for wallets exported directly from Polymarket.com
   - GNOSIS_SAFE is correct for proxy/Safe wallets

### What Works Now

✅ EOA authenticates (POLY_ADDRESS + EIP-712 signature)
✅ Proxy wallet linked via `funder` parameter
✅ Signature type 2 (GNOSIS_SAFE) for proxy wallets
✅ Proper separation of signing identity (EOA) and trading identity (proxy)

## Testing

To test after Turnkey quota resets or with a paid plan:

```bash
curl -X POST http://localhost:3000/api/polymarket/l2-credentials \
  -H "Content-Type: application/json" \
  -d '{"polymarket_account_address": "0xC6fa9A0058f324cF4D33e7dDd4F0B957E5D551e5"}'
```

Expected response:
```json
{
  "ok": true,
  "status": "created",
  "polymarket_account_address": "0xC6fa9A00...",
  "validated": true
}
```

## References

- [Polymarket CLOB Authentication Docs](https://docs.polymarket.com/developers/CLOB/authentication)
- [@polymarket/clob-client](https://www.npmjs.com/package/@polymarket/clob-client)
- Turnkey API: https://docs.turnkey.com

