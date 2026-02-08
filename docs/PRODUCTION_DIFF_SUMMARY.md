# What’s not on production yet (vs `origin/main`)

Production is built from **`origin/main`** (currently at `4edf4c9` after the LT + auto-copy merge). Below is what exists only on other branches or in your working tree.

---

## 1. Uncommitted changes in this worktree (zbd)

**Branch:** `chore/remove-auto-copy-add-lt-push` (already merged to main; these are **local-only** edits.)

| Area | Files | What’s different |
|------|--------|-------------------|
| LT API | `app/api/lt/strategies/route.ts`, `.../pause/route.ts`, `.../resume/route.ts`, `.../[id]/route.ts` | Local changes (e.g. params/types) not on main |
| FT / Fire feed | `app/api/ft/resolve/route.ts`, `app/api/ft/sync/route.ts`, `app/api/ft/wallets/route.ts`, `app/api/ft/wallets/[id]/route.ts`, `app/api/fire-feed/route.ts` | Resolve/sync/wallet and fire-feed logic |
| UI | `app/feed/page.tsx`, `app/ft/[id]/page.tsx`, `components/polycopy/trade-card.tsx`, `components/polyscore/PolySignal.tsx` | Feed, FT detail, trade card, PolySignal |
| Cleanup | `lib/ft-excluded-traders.ts` (deleted), `docs/FORWARD_TESTING_LEARNINGS...` (deleted), `supabase/migrations/20260208_ft_learnings_strategies.sql` (deleted) | Removed/simplified files |

**Action:** Commit these on a branch and merge to `main` if you want them in production, or discard if they’re obsolete.

---

## 2. Branches with exactly 1 commit not in main

Each of these has **one** commit on top of an older base. Only the changes in that commit are “new” relative to that base; merging the whole branch would also change history. Prefer **cherry-pick** or **re-apply** the specific changes onto `main` if you want them in production.

### ft-forward-testing

- **Commit:** `25694f9` – LT nav, fire feed + PolySignal server signals, ft-snapshot cron, checkpoint fix  
- **Unique changes (merge-base → branch):**
  - `app/api/fire-feed/route.ts` – fire-feed + PolySignal server signals
  - `app/components/BottomNav.tsx` – +23 lines (e.g. Live nav)
  - `app/lt/page.tsx` – +9 lines
  - `components/polycopy/navigation.tsx`, `components/polyscore/PolySignal.tsx` – nav + PolySignal
  - `daily-sync-trades-markets.py`, `vercel.json` – small tweaks

### ft-learnings-deploy

- **Commit:** `f9781d7` – Fix FT dashboard: Live/Awaiting resolution + require market.closed for resolve  
- **Unique changes:**
  - `app/api/ft/resolve/route.ts` – resolve logic (e.g. require market.closed)
  - `app/api/ft/wallets/[id]/route.ts` – +73 lines (wallet detail)
  - `app/ft/[id]/page.tsx` – FT detail page fixes

### polysignal-v2

- **Commit:** `a121262` – PolySignal v2 – deterministic trade scoring with full insights  
- **Unique changes:**
  - `components/polyscore/AIConfidenceBadge.tsx` – **new** (337 lines)
  - `components/polyscore/CopySignal.tsx` – **new** (448 lines)
  - `components/polyscore/PolySignal.tsx` – large update (~951 lines added in diff)
  - `components/polyscore/index.ts` – exports
  - `components/polycopy/trade-card.tsx` – small change

### rawdon_0205

- **Commit:** `95bcdd3` – Add Forward Testing (FT): admin wallets, model gating, crons, migrations  
- **Unique changes:** Many files (migrations, docs, scripts, FT auth, predict-trade, vercel.json). This branch is a large FT feature set; most of it is likely already on main via other merges. The “unique” delta is the full set of changes from its merge-base to tip (46 files, ~8642 insertions). Needs a careful diff against current `main` to see what’s still missing.

### roi-fix-deployment

- **Commit:** `62b89bc` – Fix ROI calculation to use resolved trades only  
- **Unique changes:**
  - `components/polyscore/PredictionStats.tsx` – ROI fix (resolved trades only)
  - `lib/formatters.ts` – **new** (165 lines)
  - `rebuild-trader-profile-stats-bigquery-fixed.sql`, `rebuild-trader-stats-bigquery-fixed.sql` – rebuild scripts
  - `supabase/migrations/20260205_add_resolved_stats_columns.sql` – migration
  - `sync-trader-stats-from-bigquery.py` – **new** (46 lines)
  - `vercel.json` – cron/config tweaks

---

## 3. Suggested next steps

1. **Uncommitted in zbd**  
   - Either commit and push a branch (e.g. `chore/lt-api-ft-cleanup`) and open a PR to `main`, or stash/discard if no longer needed.

2. **ROI fix (roi-fix-deployment)**  
   - If you want the “resolved trades only” ROI fix on production: cherry-pick `62b89bc` onto `main` (or merge after bringing the branch up to date with main) and run the migration `20260205_add_resolved_stats_columns.sql` on prod if not already applied.

3. **FT dashboard fix (ft-learnings-deploy)**  
   - Cherry-pick `f9781d7` onto `main` (or merge) to get the “Live/Awaiting resolution” and market.closed requirement.

4. **PolySignal v2 (polysignal-v2)**  
   - Merge or cherry-pick `a121262` if you want AIConfidenceBadge, CopySignal, and the new PolySignal logic on production.

5. **Fire feed + nav (ft-forward-testing)**  
   - Re-apply or cherry-pick the fire-feed and PolySignal server-signal changes onto current `main` (branch is on an old base).

6. **rawdon_0205**  
   - Compare `rawdon_0205` to current `main` file-by-file to see which FT/migration/docs changes are still missing, then merge or cherry-pick only those.

---

## 4. Quick reference: branches vs main

| Branch | 1 commit not in main | Summary |
|--------|----------------------|--------|
| **ft-forward-testing** | 25694f9 | Fire feed + PolySignal signals, LT nav, ft-snapshot cron |
| **ft-learnings-deploy** | f9781d7 | FT resolve + wallet detail + market.closed |
| **polysignal-v2** | a121262 | PolySignal v2, AIConfidenceBadge, CopySignal |
| **rawdon_0205** | 95bcdd3 | Large FT set (migrations, docs, scripts) – verify vs main |
| **roi-fix-deployment** | 62b89bc | ROI = resolved trades only, formatters, rebuild scripts, migration |

All of the above are **not on production** until merged or cherry-picked into `main` and deployed.
