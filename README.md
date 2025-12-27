This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Public trades backfill

- `node scripts/backfill-trades-public.js --auto --mode=clob` – run the full CLOB-backed ingestion (requires POLYMARKET_CLOB API credentials). This walks the history backwards via time cursors, keeps progress in `.backfill-trades-public.json`, and records statuses in `wallet_backfills`.
- `node scripts/backfill-trades-public.js --auto --mode=data` – ingest the recent window using the public Data API; offsets are capped at 1,000 and when a wallet hits the cap it is marked as `partial_offset_cap` in `wallet_backfills` (you can re-run it later once CLOB creds are available).
- `node scripts/backfill-trades-public.js --wallet=0xabc... --mode=clob --progress-file=progress-0xabc.json` – re-run a single wallet (e.g., after removing it from `bad_wallets.json`) using the desired mode while isolating its progress file.
- `node scripts/backfill-trades-public.js --status` – report how many wallets are done/remaining, view quarantined wallets, and inspect the latest `wallet_backfills` entries.

Backfill pages now call the RPC `upsert_trades_public(trades jsonb)` so every ingestion upserts by `trade_id`, bumps `last_seen_at`, and only overwrites mutable fields when the incoming row is at least as recent as the existing one. Migration `supabase/migrations/036_trades_public_hardening.sql` cleans duplicates, adds `status/last_seen_at/source_updated_at/trade_time`, and introduces the `wallet_backfills` table that powers the new workflow.
