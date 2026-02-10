#!/usr/bin/env npx tsx
/**
 * Run the FT wallet description migration.
 * Requires: DATABASE_URL (Postgres connection string from Supabase Dashboard > Settings > Database)
 *
 * Run: npx tsx scripts/run-ft-description-migration.ts
 *
 * Or apply manually via Supabase Dashboard: SQL Editor > paste migration file > Run
 */
import { config } from 'dotenv';
import path from 'path';
import fs from 'fs';
config({ path: path.resolve(process.cwd(), '.env.local') });
config();

const DATABASE_URL = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;

async function main() {
  const migrationPath = path.join(
    process.cwd(),
    'supabase/migrations/20260327_enrich_ft_wallet_descriptions_comprehensive.sql'
  );

  if (!DATABASE_URL) {
    console.error('Set DATABASE_URL or SUPABASE_DB_URL to run this migration.');
    process.exit(1);
  }

  try {
    const { Client } = await import('pg');
    const client = new Client({ connectionString: DATABASE_URL });
    await client.connect();
    const sql = fs.readFileSync(migrationPath, 'utf8');
    await client.query(sql);
    await client.end();
    console.log('Migration applied successfully.');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
  console.error('Or apply manually: Supabase Dashboard > SQL Editor > paste the contents of:');
  console.error(migrationPath);
  process.exit(1);
}

main();
