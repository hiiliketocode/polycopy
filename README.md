# Polycopy

A Next.js application for tracking and copying trades from top Polymarket traders.

## Getting Started

### Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the application.

### Environment Setup

Copy `.env.local.example` to `.env.local` and configure required environment variables. See setup guides in `docs/setup/` for detailed configuration instructions.

## Documentation

### Setup Guides
- [Supabase Setup](docs/setup/SUPABASE_SETUP.md) - Database configuration
- [Stripe Setup](docs/setup/STRIPE_SETUP.md) - Payment processing
- [CLOB API Setup](docs/setup/CLOB_API_SETUP.md) - Polymarket CLOB integration
- [Fly.io Setup](docs/setup/FLY_SETUP.md) - Worker deployment
- [Builder Attribution](docs/setup/BUILDER_ATTRIBUTION_SETUP.md) - Attribution tracking
- [Encryption Keys](docs/setup/ENCRYPTION_KEYS_GUIDE.md) - Key management

### Reference Documentation
- [Deployment Guide](docs/reference/DEPLOY_QUICK_REFERENCE.md) - Quick deployment reference
- [Vercel Deployment](docs/reference/VERCEL_DEPLOYMENT_CHECKLIST.md) - Vercel-specific checklist
- [Polymarket API](docs/reference/POLYMARKET_API.md) - API integration details
- [Worker System](docs/reference/WORKER_SYSTEM.md) - Background worker architecture
- [Routing Guide](docs/reference/ROUTING_GUIDE.md) - Application routing
- [Visual Design](docs/reference/VISUAL_DESIGN_SPEC.md) - Design system
- [SQL Files](docs/reference/SQL_FILES_README.md) - Database schema reference
- [Dependency Management](docs/reference/DEPENDENCY_MANAGEMENT_POLICY.md) - Package update policy

### Additional Resources
- [Supabase Migrations](supabase/migrations/) - Database migration files
- [Scripts](scripts/) - Utility scripts and tools
- [Workers](workers/) - Background job processors

## Key Features

- **Trade Copying**: Automatically copy trades from top Polymarket traders
- **Real-time Updates**: Live trade notifications and position tracking
- **Portfolio Analytics**: Comprehensive PnL tracking and performance metrics
- **Auto-close**: Automatic position management based on trader actions
- **Premium Tiers**: Subscription-based access to advanced features

## Architecture

### Tech Stack
- **Frontend**: Next.js 16, React, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes, Supabase
- **Workers**: Fly.io-hosted background processors
- **Payments**: Stripe
- **Deployment**: Vercel (web) + Fly.io (workers)

### Background Workers
- **Hot Worker**: Processes recent trades, active positions (30s polling)
- **Cold Worker**: Handles historical data, inactive positions (5min polling)

See [Worker System](docs/reference/WORKER_SYSTEM.md) for details.

## Scripts

### Public Trades Backfill

```bash
# Full CLOB-backed ingestion (requires API credentials)
node scripts/backfill-trades-public.js --auto --mode=clob

# Recent window using public Data API
node scripts/backfill-trades-public.js --auto --mode=data

# Single wallet backfill
node scripts/backfill-trades-public.js --wallet=0xabc... --mode=clob

# Check backfill status
node scripts/backfill-trades-public.js --status
```

Backfills use `upsert_trades_public(trades jsonb)` RPC to handle duplicates and track progress in `wallet_backfills` table.

### Other Utilities

See [scripts/](scripts/) directory for additional tools:
- Database migrations and cleanup
- Data validation and fixes
- Market data ingestion
- Admin utilities

## Deployment

### Vercel (Main Application)
```bash
# Deploy to production
git push origin main
```

Auto-deploys via GitHub integration. See [Vercel Deployment Checklist](docs/reference/VERCEL_DEPLOYMENT_CHECKLIST.md).

### Fly.io (Workers)
```bash
cd workers
fly deploy -c fly.worker-hot.toml
fly deploy -c fly.worker-cold.toml
```

See [Worker Deployment](workers/DEPLOYMENT_CHECKLIST.md) for details.

## Contributing

This is a private project. For questions or issues, contact the maintainers.

## License

Proprietary - All rights reserved
