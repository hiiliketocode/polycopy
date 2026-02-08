#!/usr/bin/env npx tsx
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function runMigration() {
  console.log('Running FT migration...');
  
  // Create ft_wallets table
  const { error: walletsError } = await supabase.rpc('exec', { 
    query: `
      CREATE TABLE IF NOT EXISTS public.ft_wallets (
        wallet_id TEXT PRIMARY KEY,
        config_id TEXT NOT NULL,
        display_name TEXT NOT NULL,
        description TEXT,
        detailed_description TEXT,
        starting_balance DECIMAL(12,2) NOT NULL DEFAULT 1000.00,
        current_balance DECIMAL(12,2) NOT NULL DEFAULT 1000.00,
        total_pnl DECIMAL(12,2) DEFAULT 0.00,
        model_threshold DECIMAL(4,3),
        price_min DECIMAL(4,3) DEFAULT 0.0,
        price_max DECIMAL(4,3) DEFAULT 1.0,
        min_edge DECIMAL(4,3) DEFAULT 0.0,
        use_model BOOLEAN DEFAULT TRUE,
        bet_size DECIMAL(10,2) NOT NULL DEFAULT 1.20,
        min_trader_resolved_count INTEGER DEFAULT 30,
        start_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        end_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() + INTERVAL '4 days'),
        last_sync_time TIMESTAMP WITH TIME ZONE,
        is_active BOOLEAN DEFAULT TRUE,
        total_trades INTEGER DEFAULT 0,
        open_positions INTEGER DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `
  });
  
  if (walletsError) {
    console.log('Note: ft_wallets table may already exist or need direct SQL execution');
    console.log('Error:', walletsError.message);
  }
  
  // Try simple approach - create tables via direct insert/select
  // First check if table exists by trying to query it
  const { data: existingWallets, error: checkError } = await supabase
    .from('ft_wallets')
    .select('wallet_id')
    .limit(1);
  
  if (checkError && checkError.message.includes('does not exist')) {
    console.log('Table does not exist - please run the SQL migration manually in Supabase Dashboard');
    console.log('SQL file: supabase/migrations/20260207_create_forward_testing_tables.sql');
    process.exit(1);
  }
  
  if (existingWallets !== null) {
    console.log('✅ ft_wallets table exists');
    
    // Check for existing wallets
    const { data: wallets } = await supabase.from('ft_wallets').select('wallet_id');
    console.log(`Found ${wallets?.length || 0} existing wallets`);
    
    if (!wallets || wallets.length === 0) {
      console.log('Inserting default wallets...');
      await insertDefaultWallets();
    }
  }
  
  // Check orders table
  const { error: ordersCheckError } = await supabase
    .from('ft_orders')
    .select('order_id')
    .limit(1);
  
  if (ordersCheckError && ordersCheckError.message.includes('does not exist')) {
    console.log('⚠️ ft_orders table does not exist - please run the SQL migration manually');
  } else {
    console.log('✅ ft_orders table exists');
  }
  
  console.log('\nMigration check complete!');
}

async function insertDefaultWallets() {
  const wallets = [
    {
      wallet_id: 'FT_HIGH_CONVICTION',
      config_id: 'HIGH_CONVICTION',
      display_name: 'High Conviction',
      description: '95ct+ underdogs only, no model filter',
      detailed_description: `**Strategy**: Copy only ultra-high-conviction trades from experienced traders.

**Entry Criteria**:
- Trader win rate: 95%+ (top 1% of traders)
- Price range: 0-50¢ (underdog positions)
- Minimum trader experience: 30+ resolved trades
- No model filter - relies purely on trader track record

**Why This Works**: Traders with 95%+ win rates are extremely selective. When they bet on underdogs, they likely have strong conviction based on information not yet reflected in the market.`,
      starting_balance: 1000.00,
      current_balance: 1000.00,
      bet_size: 1.20,
      model_threshold: null,
      price_min: 0.0,
      price_max: 0.50,
      min_edge: 0.0,
      use_model: false,
      is_active: true
    },
    {
      wallet_id: 'FT_MODEL_BALANCED',
      config_id: 'MODEL_BALANCED',
      display_name: 'Model Balanced',
      description: 'Model 50%+ confidence, 55%+ trader WR, 5%+ edge',
      detailed_description: `**Strategy**: Balanced approach using both model predictions and trader statistics.

**Entry Criteria**:
- Model probability: 50%+ (model thinks trade is likely profitable)
- Trader win rate: 55%+ 
- Price range: Full range (0-100¢)
- Minimum edge: 5% (trader_wr - price >= 0.05)
- Minimum trader experience: 30+ resolved trades

**Why This Works**: Combines model intelligence with proven trader track records. The 5% edge requirement ensures we only enter when odds are meaningfully in our favor.`,
      starting_balance: 1000.00,
      current_balance: 1000.00,
      bet_size: 1.20,
      model_threshold: 0.50,
      price_min: 0.0,
      price_max: 1.0,
      min_edge: 0.05,
      use_model: true,
      is_active: true
    },
    {
      wallet_id: 'FT_UNDERDOG_HUNTER',
      config_id: 'UNDERDOG_HUNTER',
      display_name: 'Underdog Hunter',
      description: 'Model 50%+, underdogs (<50¢), 5%+ edge',
      detailed_description: `**Strategy**: Hunt for mispriced underdog positions using model + trader signals.

**Entry Criteria**:
- Model probability: 50%+ confidence
- Price range: 0-50¢ (underdog positions only)
- Minimum edge: 5%
- Minimum trader experience: 30+ resolved trades

**Why This Works**: Underdogs offer higher payouts when they win. By filtering for model confidence and edge, we identify underdogs that are likely mispriced by the market.`,
      starting_balance: 1000.00,
      current_balance: 1000.00,
      bet_size: 1.20,
      model_threshold: 0.50,
      price_min: 0.0,
      price_max: 0.50,
      min_edge: 0.05,
      use_model: true,
      is_active: true
    },
    {
      wallet_id: 'FT_FAVORITE_GRINDER',
      config_id: 'FAVORITE_GRINDER',
      display_name: 'Favorite Grinder',
      description: 'High WR traders, favorites (>50¢), consistent wins',
      detailed_description: `**Strategy**: Grind consistent small wins by backing favorites with high-WR traders.

**Entry Criteria**:
- Trader win rate: 60%+ 
- Price range: 50-90¢ (favorites only)
- Minimum edge: 3%
- Minimum trader experience: 30+ resolved trades

**Why This Works**: Favorites win more often. Combined with high-WR traders, this aims for consistent small wins rather than big payouts.`,
      starting_balance: 1000.00,
      current_balance: 1000.00,
      bet_size: 1.20,
      model_threshold: null,
      price_min: 0.50,
      price_max: 0.90,
      min_edge: 0.03,
      use_model: false,
      is_active: true
    }
  ];
  
  for (const wallet of wallets) {
    const { error } = await supabase
      .from('ft_wallets')
      .upsert(wallet, { onConflict: 'wallet_id' });
    
    if (error) {
      console.error(`Error inserting ${wallet.wallet_id}:`, error.message);
    } else {
      console.log(`✅ Inserted ${wallet.wallet_id}`);
    }
  }
}

runMigration().catch(console.error);
