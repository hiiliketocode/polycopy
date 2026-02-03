# Repository Cleanup Plan

## Current State
- **164 markdown docs** (mostly in `/docs`)
- **64 scripts** (34 are debug/one-off scripts)
- **Loose files in root**: RATE_LIMIT_FIX.md, onboarding HTML files, SQL files

## Cleanup Recommendations

### 1. Root Directory Cleanup

**Move to `/docs/archive/`:**
- `RATE_LIMIT_FIX.md` → `docs/archive/RATE_LIMIT_FIX.md` (historical fix)
- `RUN_THIS_ADD_PROFILE_IMAGE.sql` → `docs/setup/RUN_THIS_ADD_PROFILE_IMAGE.sql`
- `onboarding-v2.html` → `docs/archive/onboarding-v2.html` (old version)
- `onboarding-v3.html` → `docs/archive/onboarding-v3.html` (old version)

**Keep in root:**
- `README.md` (main project readme)

### 2. Scripts Directory Cleanup

Create subdirectories:

```
scripts/
├── backfill/          # Data migration scripts
│   ├── backfill-subscription-data.js
│   ├── backfill-trades-public.js
│   ├── backfill-wallet-pnl.js
│   └── ...
├── admin/             # Admin/operational scripts
│   ├── audit-premium-users.js
│   ├── count-paying-customers.js
│   └── subscription-stats.js
├── debug/             # Debug/diagnostic scripts (archive)
│   ├── check-*.js/sql
│   ├── diagnose-*.sql
│   ├── debug-*.js
│   └── test-*.js/cjs
└── archive/           # Old/unused scripts
    ├── disable-read-only-*.sql (many readonly fixes - no longer needed)
    ├── fix-readonly-*.sql
    └── truncate-trades*.js
```

**Scripts to Archive** (34 files):
- `check-auto-close-activity.js`
- `check-db-health.js`
- `check-db-recovery.sql`
- `check-disk-io-issues.sql`
- `check-jan17-final.js`
- `check-new-project-readonly.sql`
- `check-pnl-jan17*.js`
- `check-read-only-status.sql`
- `check-transaction-readonly-state.sql`
- `check-wallet-pnl-daily-stats.js`
- `comprehensive-fix-readonly.sql`
- `debug-auto-close-query.js`
- `debugClobPull.ts`
- `deep-diagnosis-readonly.sql`
- `delete-trades-table.sql`
- `diagnose-actual-readonly.sql`
- `diagnose-missing-trades.sql`
- `disable-read-only-*.sql` (8+ files)
- `fix-disk-io-indexes.sql`
- `fix-new-project-readonly.sql`
- `fix-readonly-after-cooldown.sql`
- `force-disable-read-only.sql`
- `simple-disable-read-only.sql`
- `test-auth-check.cjs`
- `test-l2-credentials.cjs`
- `test-place-order.cjs`
- `test-trade-ingestion.js`
- `test-trading-smoke.cjs`
- `test-write-access.sql`
- `truncate-trades*.js` (3 files)

### 3. Docs Directory Cleanup

**Current Structure:**
```
docs/
├── archive/          # 82 files (good!)
├── reference/        # 8 files (good!)
├── setup/            # 6 files (good!)
└── 30+ loose files
```

**Reorganize loose docs into:**

```
docs/
├── archive/          # Historical fixes/investigations
│   └── [already organized - 82 files]
├── reference/        # Technical reference
│   └── [already organized - 8 files]
├── setup/            # Setup guides
│   └── [already organized - 6 files]
├── features/         # NEW: Feature documentation
│   ├── SUBSCRIPTION_TRACKING_DEPLOYMENT.md
│   ├── TRADE_HISTORY_SUMMARY.md
│   ├── public-trades.md
│   └── user-clob-orders.md
├── deployment/       # NEW: Deployment & operations
│   ├── DEPLOYMENT_CHECKLIST.md
│   ├── GSC_QUICK_ACTION_CHECKLIST.md
│   └── WELCOME_EMAIL_SETUP_CHECKLIST.md
├── security/         # NEW: Security fixes/audits
│   ├── CRITICAL_FIX_DEV_BYPASS_AUTH.md
│   ├── DEV_BYPASS_AUTH_COMPLETE.md
│   ├── RLS_SECURITY_FIX.md
│   ├── SECURITY_FIXES_SUMMARY.md
│   ├── SECURITY_HEADERS_IMPLEMENTATION.md
│   └── SERVICE_ROLE_AUDIT.md
├── performance/      # NEW: Performance optimizations
│   ├── CORE_WEB_VITALS_FIXES.md
│   ├── CORE_WEB_VITALS_OPTIMIZATIONS.md
│   └── PERFORMANCE_DATA_FIXES_JAN_13_2026.md
├── launch/           # NEW: Launch materials
│   ├── LAUNCH_PACKAGE_README.md
│   ├── LAUNCH_SUBMISSION_PACKAGE.md
│   ├── LAUNCH_TRACKING_SHEET.md
│   ├── PLATFORM_SUBMISSION_GUIDES.md
│   ├── PLATFORM_SUBMISSION_STATUS.md
│   ├── PLATFORMS_TO_AVOID.md
│   └── ACTUALLY_FREE_PLATFORMS.md
└── bugs/             # NEW: Bug investigations
    ├── HANDOFF_SELL_ORDERS_BUG.md
    ├── PNL_DISCREPANCY_DEBUG_GUIDE.md
    └── PNL_DISCREPANCY_INVESTIGATION_JAN13.md
```

### 4. Git Ignore Updates

Add to `.gitignore`:
```
# Debug/test scripts output
scripts/debug/*.log
scripts/.backfill-progress.json

# Old HTML versions
docs/archive/onboarding-*.html
```

## Estimated Impact

**Before:**
- 164 docs scattered
- 64 scripts in flat directory
- 5 loose files in root

**After:**
- 164 docs organized into 10 categories
- 64 scripts in 4 subdirectories
- 1 file in root (README.md)
- Much easier to find things!

## Implementation

Run the cleanup script or manually reorganize?

Would you like me to:
1. **Create a cleanup script** that does all this automatically
2. **Just archive the debug scripts** (safest, least disruptive)
3. **Skip cleanup** (keep as-is)
