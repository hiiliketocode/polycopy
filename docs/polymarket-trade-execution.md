# Polymarket Trade Execution

## Architecture and responsibility boundaries
- **Website-driven UI**: `polymarket.com` hosts the public experience and is only used by browsers for navigation, wallet connection, and marketing. No server-side flow may proxy or post orders through this domain.
- **CLOB API (https://clob.polymarket.com)**: All server-to-server trading traffic must go directly to the sanctioned CLOB API host with Turnkey-managed credentials. Environment variables such as `POLYMARKET_CLOB_BASE_URL` gate this target and throw if they point at `polymarket.com`.
- **Wallet signing (Turnkey)**: Wallet secrets stay with Turnkey. Browser flows (WalletConnect, Magic Link sign-ins, preview orders) live entirely client-side, while server-side routes only call `createOrder`/`postOrder` via an authenticated `ClobClient`.
- Together, these rules keep browser wallet interactions separate from server batch execution while preventing website traffic from being tunneled through Vercel functions.

## Cloudflare detection and logging
- Cloudflare’s WAF adapts to automated datacenter traffic, so a request that worked yesterday can be flagged today once the IP earns a higher threat score; this is expected behavior, not a regression.
- Blocked responses arrive as HTML (`<!DOCTYPE html>`), so the server now:
  1. Logs the exact request URL/hostname for each order attempt.
  2. Parses the response for the Cloudflare Ray ID and surfaces `blocked_by_cloudflare` with that Ray ID.
  3. Fails fast on anything that is not a 2xx JSON response and never claims `ok: true` unless a valid order ID was returned.
- Any HTML reply is treated as a hard failure (no retries) and recorded with its Ray ID so operators can reference the Cloudflare dashboard.

## Operational checklist
- Always confirm your trading route logs the CLOB base URL before dispatching orders—if the logged hostname ever reads `polymarket.com`, the configuration is wrong.
- Server-side code must never spoof browser cookies or attempt to solve Cloudflare challenges; treat those responses as blocked traffic and escalate to the site owner if needed.
- When you see `blocked_by_cloudflare`, check whether the IP changed (datacenter rotation) or if the rate/pattern of orders increased, then step through the logs to see the last logged `requestUrl` and Ray ID.

## Evomi residential proxy (optional)

- Set `EVOMI_API_KEY` to the key provided by the Evomi dashboard (`https://api.evomi.com/public`).
  The server will fetch the configured proxy credentials (endpoint, username/password, ports) and configure `axios` to send CLOB traffic through that residential proxy.
- `EVOMI_PROXY_PRODUCT` can override the default product code (`rpc`). If it's not set or the specified product is missing, Polycopy falls back to the first product the API returned.
- `EVOMI_PROXY_PROTOCOL` defaults to `http` but may be set to `https` if the product advertises an HTTPS proxy port.
- `EVOMI_PROXY_CACHE_SECONDS` controls how long we keep the fetched proxy URL before calling the API again (default 300 seconds). The helper reuses the cached credentials across requests to reduce throttling.
- Keep the API key confidential (do not check it into git), and rotate it via the Evomi dashboard if it ever gets exposed.
