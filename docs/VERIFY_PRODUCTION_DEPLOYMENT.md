# Verify Production Deployment

After pushing the trading improvements, use this checklist to confirm everything is working.

---

## 1. Push to Production

```bash
# Commit and push (Vercel auto-deploys on push to main)
git add -A
git status   # Review changes
git commit -m "Trading improvements: real-time worker, MCP, cron reduction"
git push origin main
```

**Worker (Fly.io):** Already deployed. If you made worker changes, redeploy:
```bash
cd workers/polymarket-trade-stream && flyctl deploy -a polycopy-trade-stream
```

---

## 2. What to Check

### A. Worker logs (Fly.io)

```bash
flyctl logs -a polycopy-trade-stream
```

**Normal operation:**
```
[worker] Health check listening on :3000
[worker] Connected to Polymarket WebSocket
[worker] Loaded N target traders
```

**When a qualifying trade happens (new):**
```
[sync-trade] Inserted 1 ft_order(s) for trade 0x...
[lt-execute] Triggered: 1 order(s) placed
```

If you see `Inserted` but no `lt-execute` line, the LT trigger ran but placed 0 orders (e.g. no active strategies, or order didn’t qualify).

### B. Vercel cron

- **ft-sync:** Runs every **5 minutes** (was 1 minute). Check Vercel → Project → Logs, filter by `/api/cron/ft-sync`.
- **lt-execute:** Still every 1 minute. With the worker, most new orders come from the worker trigger; cron is backup.

### C. MCP server

- Runs locally when Cursor connects. No server-side logs.
- To test: In Cursor, ask “List my strategies” or “Get orders for strategy LT_xxx”. If the MCP is configured, the AI will call the tools and return data.

### D. Stream pipeline (leaderboard-style FTs)

When any FT wallet has no `target_trader`/`target_traders`, the worker forwards trades from the `traders` table. To verify: (1) Call `/api/ft/stream-status` — check `target_traders_count` > 0 and `has_leaderboard_wallets`. (2) Worker logs should show `[worker] Loaded N target traders (incl. leaderboard)` and `[worker] Forwarded trade from 0x...`. (3) If `target_traders_count` is 0, ensure `traders` table is populated (sync-trader-leaderboard runs daily at 1am UTC).

---

## 3. Quick health check

**Worker:**
```bash
curl -s https://polycopy-trade-stream.fly.dev/ | head -1
# Should return: ok
```

**API (target traders):**
```bash
curl -s -H "Authorization: Bearer YOUR_CRON_SECRET" \
  https://polycopy.app/api/ft/target-traders | jq .
# Should return: { "traders": [...], "count": N, "has_leaderboard_wallets": true/false }
```

**Stream status (full pipeline diagnostic):**
```bash
curl -s -H "Authorization: Bearer YOUR_CRON_SECRET" \
  https://polycopy.app/api/ft/stream-status | jq .
# Returns: target_traders_count, leaderboard_wallet_count, ft_orders_last_24h, etc.
```

---

## 4. Log changes summary

| Component | Before | After |
|-----------|--------|-------|
| **Worker** | `[sync-trade] Inserted N` only | + `[lt-execute] Triggered: N order(s) placed` when orders placed |
| **ft-sync cron** | Every 1 min | Every 5 min (fewer log entries) |
| **lt-execute** | Only from cron | From cron + worker trigger (more varied timing) |

---

## 5. If something’s wrong

| Symptom | Check |
|---------|-------|
| No `[worker] Forwarded trade` in worker logs | Call `/api/ft/stream-status` — is `target_traders_count` > 0? Redeploy worker after API changes. |
| No `[lt-execute] Triggered` in worker logs | Do you have active LT strategies? Any ft_orders inserted? |
| Worker keeps restarting | `flyctl logs` for errors; verify `API_BASE_URL` and `CRON_SECRET` |
| MCP tools return errors | Ensure `POLYCOPY_API_URL` and `CRON_SECRET` in `.cursor/mcp.json` |
| Circuit breaker opened | `[circuit] OPEN` in worker logs → API was returning 5xx; check Vercel/Supabase |
