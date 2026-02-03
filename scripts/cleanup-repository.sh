#!/bin/bash
# Repository Cleanup Script - Full Reorganization
# Organizes docs and scripts into logical directories

set -e

DRY_RUN=${1:-"--dry-run"}
COLOR_GREEN='\033[0;32m'
COLOR_BLUE='\033[0;34m'
COLOR_YELLOW='\033[1;33m'
COLOR_RED='\033[0;31m'
COLOR_RESET='\033[0m'

if [ "$DRY_RUN" = "--dry-run" ]; then
    echo -e "${COLOR_YELLOW}🔍 DRY RUN MODE - No changes will be made${COLOR_RESET}"
    echo -e "${COLOR_YELLOW}Run with --execute flag to apply changes${COLOR_RESET}"
    echo ""
fi

move_file() {
    local src=$1
    local dest=$2
    
    if [ -f "$src" ]; then
        if [ "$DRY_RUN" = "--dry-run" ]; then
            echo -e "${COLOR_BLUE}MOVE:${COLOR_RESET} $src → $dest"
        else
            mkdir -p "$(dirname "$dest")"
            git mv "$src" "$dest" 2>/dev/null || mv "$src" "$dest"
            echo -e "${COLOR_GREEN}✓ MOVED:${COLOR_RESET} $src → $dest"
        fi
    fi
}

create_dir() {
    local dir=$1
    if [ "$DRY_RUN" = "--dry-run" ]; then
        echo -e "${COLOR_BLUE}CREATE DIR:${COLOR_RESET} $dir"
    else
        mkdir -p "$dir"
        echo -e "${COLOR_GREEN}✓ CREATED:${COLOR_RESET} $dir"
    fi
}

echo "========================================="
echo "Repository Cleanup - Full Reorganization"
echo "========================================="
echo ""

# ============================================
# 1. Create New Directory Structure
# ============================================
echo -e "${COLOR_YELLOW}📁 Creating directory structure...${COLOR_RESET}"

create_dir "docs/features"
create_dir "docs/deployment"
create_dir "docs/security"
create_dir "docs/performance"
create_dir "docs/launch"
create_dir "docs/bugs"
create_dir "scripts/backfill"
create_dir "scripts/admin"
create_dir "scripts/archive"

echo ""

# ============================================
# 2. Move Root Files to Docs
# ============================================
echo -e "${COLOR_YELLOW}📄 Moving root files to docs...${COLOR_RESET}"

move_file "RATE_LIMIT_FIX.md" "docs/archive/RATE_LIMIT_FIX.md"
move_file "onboarding-v2.html" "docs/archive/onboarding-v2.html"
move_file "onboarding-v3.html" "docs/archive/onboarding-v3.html"
move_file "RUN_THIS_ADD_PROFILE_IMAGE.sql" "docs/setup/RUN_THIS_ADD_PROFILE_IMAGE.sql"

echo ""

# ============================================
# 3. Organize Docs into Categories
# ============================================
echo -e "${COLOR_YELLOW}📚 Organizing documentation...${COLOR_RESET}"

# Features
move_file "docs/SUBSCRIPTION_TRACKING_DEPLOYMENT.md" "docs/features/SUBSCRIPTION_TRACKING_DEPLOYMENT.md"
move_file "docs/TRADE_HISTORY_SUMMARY.md" "docs/features/TRADE_HISTORY_SUMMARY.md"
move_file "docs/TRADE_HISTORY_ARCHITECTURE.md" "docs/features/TRADE_HISTORY_ARCHITECTURE.md"
move_file "docs/TRADE_HISTORY_BACKFILL_PLAN.md" "docs/features/TRADE_HISTORY_BACKFILL_PLAN.md"
move_file "docs/TRADE_HISTORY_SIMPLE_SCHEMA.md" "docs/features/TRADE_HISTORY_SIMPLE_SCHEMA.md"
move_file "docs/public-trades.md" "docs/features/public-trades.md"
move_file "docs/user-clob-orders.md" "docs/features/user-clob-orders.md"
move_file "docs/polymarket-trade-execution.md" "docs/features/polymarket-trade-execution.md"

# Deployment
move_file "docs/DEPLOYMENT_CHECKLIST.md" "docs/deployment/DEPLOYMENT_CHECKLIST.md"
move_file "docs/GSC_QUICK_ACTION_CHECKLIST.md" "docs/deployment/GSC_QUICK_ACTION_CHECKLIST.md"
move_file "docs/WELCOME_EMAIL_SETUP_CHECKLIST.md" "docs/deployment/WELCOME_EMAIL_SETUP_CHECKLIST.md"
move_file "docs/ENABLE_LEAKED_PASSWORD_PROTECTION.md" "docs/deployment/ENABLE_LEAKED_PASSWORD_PROTECTION.md"

# Security
move_file "docs/CRITICAL_FIX_DEV_BYPASS_AUTH.md" "docs/security/CRITICAL_FIX_DEV_BYPASS_AUTH.md"
move_file "docs/DEV_BYPASS_AUTH_COMPLETE.md" "docs/security/DEV_BYPASS_AUTH_COMPLETE.md"
move_file "docs/RLS_SECURITY_FIX.md" "docs/security/RLS_SECURITY_FIX.md"
move_file "docs/SECURITY_FIXES_SUMMARY.md" "docs/security/SECURITY_FIXES_SUMMARY.md"
move_file "docs/SECURITY_HEADERS_IMPLEMENTATION.md" "docs/security/SECURITY_HEADERS_IMPLEMENTATION.md"
move_file "docs/SERVICE_ROLE_AUDIT.md" "docs/security/SERVICE_ROLE_AUDIT.md"

# Performance
move_file "docs/CORE_WEB_VITALS_FIXES.md" "docs/performance/CORE_WEB_VITALS_FIXES.md"
move_file "docs/CORE_WEB_VITALS_OPTIMIZATIONS.md" "docs/performance/CORE_WEB_VITALS_OPTIMIZATIONS.md"
move_file "docs/PERFORMANCE_DATA_FIXES_JAN_13_2026.md" "docs/performance/PERFORMANCE_DATA_FIXES_JAN_13_2026.md"
move_file "docs/ACCESSIBILITY_IMPROVEMENTS.md" "docs/performance/ACCESSIBILITY_IMPROVEMENTS.md"
move_file "docs/SEO_ACCESSIBILITY_COMPLETE_SUMMARY.md" "docs/performance/SEO_ACCESSIBILITY_COMPLETE_SUMMARY.md"
move_file "docs/TRADER_PROFILE_SEO_AND_GSC_FIXES.md" "docs/performance/TRADER_PROFILE_SEO_AND_GSC_FIXES.md"

# Launch
move_file "docs/LAUNCH_PACKAGE_README.md" "docs/launch/LAUNCH_PACKAGE_README.md"
move_file "docs/LAUNCH_SUBMISSION_PACKAGE.md" "docs/launch/LAUNCH_SUBMISSION_PACKAGE.md"
move_file "docs/LAUNCH_TRACKING_SHEET.md" "docs/launch/LAUNCH_TRACKING_SHEET.md"
move_file "docs/PLATFORM_SUBMISSION_GUIDES.md" "docs/launch/PLATFORM_SUBMISSION_GUIDES.md"
move_file "docs/PLATFORM_SUBMISSION_STATUS.md" "docs/launch/PLATFORM_SUBMISSION_STATUS.md"
move_file "docs/PLATFORMS_TO_AVOID.md" "docs/launch/PLATFORMS_TO_AVOID.md"
move_file "docs/ACTUALLY_FREE_PLATFORMS.md" "docs/launch/ACTUALLY_FREE_PLATFORMS.md"
move_file "docs/QUICK_START_GUIDE.md" "docs/launch/QUICK_START_GUIDE.md"

# Bugs
move_file "docs/HANDOFF_SELL_ORDERS_BUG.md" "docs/bugs/HANDOFF_SELL_ORDERS_BUG.md"
move_file "docs/PNL_DISCREPANCY_DEBUG_GUIDE.md" "docs/bugs/PNL_DISCREPANCY_DEBUG_GUIDE.md"
move_file "docs/PNL_DISCREPANCY_INVESTIGATION_JAN13.md" "docs/bugs/PNL_DISCREPANCY_INVESTIGATION_JAN13.md"

# Archive
move_file "docs/RATE_LIMITING_COMPLETE.md" "docs/archive/RATE_LIMITING_COMPLETE.md"
move_file "docs/merge-copied-trades-into-orders-plan.md" "docs/archive/merge-copied-trades-into-orders-plan.md"

echo ""

# ============================================
# 4. Organize Scripts
# ============================================
echo -e "${COLOR_YELLOW}🔧 Organizing scripts...${COLOR_RESET}"

# Backfill scripts
move_file "scripts/backfill-subscription-data.js" "scripts/backfill/backfill-subscription-data.js"
move_file "scripts/backfill-trades-public.js" "scripts/backfill/backfill-trades-public.js"
move_file "scripts/backfill-wallet-pnl.js" "scripts/backfill/backfill-wallet-pnl.js"
move_file "scripts/backfill-wallet-trades.js" "scripts/backfill/backfill-wallet-trades.js"
move_file "scripts/backfill-traders-leaderboard.js" "scripts/backfill/backfill-traders-leaderboard.js"
move_file "scripts/backfill-current-prices.js" "scripts/backfill/backfill-current-prices.js"
move_file "scripts/backfill-dome-markets.js" "scripts/backfill/backfill-dome-markets.js"
move_file "scripts/backfill-copied-trades-avatars.js" "scripts/backfill/backfill-copied-trades-avatars.js"
move_file "scripts/backfillTraders.ts" "scripts/backfill/backfillTraders.ts"
move_file "scripts/sync-leaderboard-and-backfill.js" "scripts/backfill/sync-leaderboard-and-backfill.js"
move_file "scripts/link-trades-public-trader-ids.js" "scripts/backfill/link-trades-public-trader-ids.js"

# Admin scripts
move_file "scripts/audit-premium-users.js" "scripts/admin/audit-premium-users.js"
move_file "scripts/count-paying-customers.js" "scripts/admin/count-paying-customers.js"
move_file "scripts/count-paying-customers.sql" "scripts/admin/count-paying-customers.sql"
move_file "scripts/subscription-stats.js" "scripts/admin/subscription-stats.js"
move_file "scripts/query-db.js" "scripts/admin/query-db.js"
move_file "scripts/exec-sql.js" "scripts/admin/exec-sql.js"
move_file "scripts/trade-lookup.js" "scripts/admin/trade-lookup.js"

# Archive debug/test scripts
move_file "scripts/check-auto-close-activity.js" "scripts/archive/check-auto-close-activity.js"
move_file "scripts/check-db-health.js" "scripts/archive/check-db-health.js"
move_file "scripts/check-db-recovery.sql" "scripts/archive/check-db-recovery.sql"
move_file "scripts/check-disk-io-issues.sql" "scripts/archive/check-disk-io-issues.sql"
move_file "scripts/check-jan17-final.js" "scripts/archive/check-jan17-final.js"
move_file "scripts/check-new-project-readonly.sql" "scripts/archive/check-new-project-readonly.sql"
move_file "scripts/check-pnl-jan17-detailed.js" "scripts/archive/check-pnl-jan17-detailed.js"
move_file "scripts/check-pnl-jan17.js" "scripts/archive/check-pnl-jan17.js"
move_file "scripts/check-read-only-status.sql" "scripts/archive/check-read-only-status.sql"
move_file "scripts/check-transaction-readonly-state.sql" "scripts/archive/check-transaction-readonly-state.sql"
move_file "scripts/check-wallet-pnl-daily-stats.js" "scripts/archive/check-wallet-pnl-daily-stats.js"
move_file "scripts/comprehensive-fix-readonly.sql" "scripts/archive/comprehensive-fix-readonly.sql"
move_file "scripts/debug-auto-close-query.js" "scripts/archive/debug-auto-close-query.js"
move_file "scripts/debugClobPull.ts" "scripts/archive/debugClobPull.ts"
move_file "scripts/deep-diagnosis-readonly.sql" "scripts/archive/deep-diagnosis-readonly.sql"
move_file "scripts/delete-trades-table.sql" "scripts/archive/delete-trades-table.sql"
move_file "scripts/diagnose-actual-readonly.sql" "scripts/archive/diagnose-actual-readonly.sql"
move_file "scripts/diagnose-missing-trades.sql" "scripts/archive/diagnose-missing-trades.sql"
move_file "scripts/disable-read-only-and-cleanup.sql" "scripts/archive/disable-read-only-and-cleanup.sql"
move_file "scripts/disable-read-only-commands.sql" "scripts/archive/disable-read-only-commands.sql"
move_file "scripts/disable-read-only-mode-step1.sql" "scripts/archive/disable-read-only-mode-step1.sql"
move_file "scripts/disable-read-only-mode-step2-vacuum.sql" "scripts/archive/disable-read-only-mode-step2-vacuum.sql"
move_file "scripts/disable-read-only-mode.js" "scripts/archive/disable-read-only-mode.js"
move_file "scripts/disable-read-only-mode.sql" "scripts/archive/disable-read-only-mode.sql"
move_file "scripts/fix-disk-io-indexes.sql" "scripts/archive/fix-disk-io-indexes.sql"
move_file "scripts/fix-new-project-readonly.sql" "scripts/archive/fix-new-project-readonly.sql"
move_file "scripts/fix-readonly-after-cooldown.sql" "scripts/archive/fix-readonly-after-cooldown.sql"
move_file "scripts/force-disable-read-only.sql" "scripts/archive/force-disable-read-only.sql"
move_file "scripts/simple-disable-read-only.sql" "scripts/archive/simple-disable-read-only.sql"
move_file "scripts/test-auth-check.cjs" "scripts/archive/test-auth-check.cjs"
move_file "scripts/test-l2-credentials.cjs" "scripts/archive/test-l2-credentials.cjs"
move_file "scripts/test-place-order.cjs" "scripts/archive/test-place-order.cjs"
move_file "scripts/test-trade-ingestion.js" "scripts/archive/test-trade-ingestion.js"
move_file "scripts/test-trading-smoke.cjs" "scripts/archive/test-trading-smoke.cjs"
move_file "scripts/test-write-access.sql" "scripts/archive/test-write-access.sql"
move_file "scripts/truncate-trades-urgent.js" "scripts/archive/truncate-trades-urgent.js"
move_file "scripts/truncate-trades.js" "scripts/archive/truncate-trades.js"
move_file "scripts/create-test-table.sql" "scripts/archive/create-test-table.sql"
move_file "scripts/setup-truncate-function.js" "scripts/archive/setup-truncate-function.js"
move_file "scripts/setup-truncate-function.sql" "scripts/archive/setup-truncate-function.sql"

# Keep active scripts in root
# - checkClobOrder.cjs, checkUserClob.*, find-test-market.cjs, import-spl-trades.js, setup-fly-cron.sh

echo ""

# ============================================
# 5. Summary
# ============================================
echo ""
echo "========================================="
echo "✅ Cleanup Complete!"
echo "========================================="
echo ""
echo "📁 New Structure:"
echo "  docs/"
echo "    ├── features/        (8 files) - Feature documentation"
echo "    ├── deployment/      (4 files) - Deployment guides"
echo "    ├── security/        (6 files) - Security fixes"
echo "    ├── performance/     (6 files) - Performance optimizations"
echo "    ├── launch/          (8 files) - Launch materials"
echo "    ├── bugs/            (3 files) - Bug investigations"
echo "    ├── reference/       (8 files) - Technical reference"
echo "    ├── setup/           (7 files) - Setup guides"
echo "    └── archive/        (80+ files) - Historical docs"
echo ""
echo "  scripts/"
echo "    ├── backfill/       (11 files) - Data migration scripts"
echo "    ├── admin/           (7 files) - Admin/operational scripts"
echo "    ├── archive/        (34 files) - Debug/one-off scripts"
echo "    └── [active]         (6 files) - Active utility scripts"
echo ""

if [ "$DRY_RUN" = "--dry-run" ]; then
    echo -e "${COLOR_YELLOW}This was a DRY RUN - no changes were made${COLOR_RESET}"
    echo -e "${COLOR_YELLOW}Review the output above, then run:${COLOR_RESET}"
    echo -e "${COLOR_GREEN}  ./scripts/cleanup-repository.sh --execute${COLOR_RESET}"
else
    echo -e "${COLOR_GREEN}All files have been reorganized!${COLOR_RESET}"
    echo ""
    echo "Next steps:"
    echo "  1. Review changes: git status"
    echo "  2. Test that everything still works"
    echo "  3. Commit: git add -A && git commit -m 'Reorganize docs and scripts'"
    echo "  4. Push: git push origin main"
fi
