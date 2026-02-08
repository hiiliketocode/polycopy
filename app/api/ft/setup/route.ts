import { NextResponse } from 'next/server';
import { createAdminServiceClient } from '@/lib/admin';
import { requireAdmin } from '@/lib/ft-auth';

/**
 * POST /api/ft/setup
 * 
 * Creates the forward testing tables and inserts default wallets.
 * This should only need to be called once.
 * Admin only.
 */
export async function POST() {
  const authError = await requireAdmin();
  if (authError) return authError;

  try {
    const supabase = createAdminServiceClient();
    
    console.log('[ft/setup] Starting setup...');
    
    // Check if ft_wallets table exists by trying to query it
    const { data: existingWallets, error: checkError } = await supabase
      .from('ft_wallets')
      .select('wallet_id')
      .limit(1);
    
    if (checkError && checkError.message.includes('does not exist')) {
      return NextResponse.json({
        success: false,
        error: 'Tables do not exist. Please run the SQL migration manually.',
        sql_file: 'supabase/migrations/20260207_create_forward_testing_tables.sql',
        instructions: 'Go to Supabase Dashboard > SQL Editor and run the contents of this file.'
      }, { status: 400 });
    }
    
    console.log('[ft/setup] ft_wallets table exists');
    
    // Check if we already have wallets
    const { data: wallets } = await supabase
      .from('ft_wallets')
      .select('wallet_id');
    
    if (wallets && wallets.length > 0) {
      console.log(`[ft/setup] Found ${wallets.length} existing wallets`);
      return NextResponse.json({
        success: true,
        message: `Setup already complete. Found ${wallets.length} wallets.`,
        wallets: wallets.map(w => w.wallet_id)
      });
    }
    
    // Insert default wallets
    const defaultWallets = [
      {
        wallet_id: 'FT_HIGH_CONVICTION',
        config_id: 'HIGH_CONVICTION',
        display_name: 'High Conviction',
        description: '95%+ trader WR, underdogs only, no model filter',
        detailed_description: `**Strategy**: Copy only ultra-high-conviction trades from experienced traders.

**Entry Criteria**:
- Trader win rate: 95%+ (top 1% of traders)
- Price range: 0-50¢ (underdog positions)
- Minimum trader experience: 30+ resolved trades
- No model filter - relies purely on trader track record

**Why This Works**: Traders with 95%+ win rates are extremely selective. When they bet on underdogs, they likely have strong conviction.`,
        starting_balance: 1000.00,
        current_balance: 1000.00,
        bet_size: 1.20,
        model_threshold: null,
        price_min: 0.0,
        price_max: 0.50,
        min_edge: 0.45, // 95% WR - 50% price = 45% edge minimum
        use_model: false,
        min_trader_resolved_count: 30,
        is_active: true
      },
      {
        wallet_id: 'FT_MODEL_BALANCED',
        config_id: 'MODEL_BALANCED',
        display_name: 'Model Balanced',
        description: '55%+ trader WR, 5%+ edge, full price range',
        detailed_description: `**Strategy**: Balanced approach using trader win rate and edge.

**Entry Criteria**:
- Trader win rate: 55%+ 
- Price range: Full range (0-100¢)
- Minimum edge: 5% (trader_wr - price >= 0.05)
- Minimum trader experience: 30+ resolved trades

**Why This Works**: Combines proven trader track records with an edge requirement to ensure we only enter when odds are meaningfully in our favor.`,
        starting_balance: 1000.00,
        current_balance: 1000.00,
        bet_size: 1.20,
        model_threshold: 0.55, // Used as min trader WR
        price_min: 0.0,
        price_max: 1.0,
        min_edge: 0.05,
        use_model: true,
        min_trader_resolved_count: 30,
        is_active: true
      },
      {
        wallet_id: 'FT_UNDERDOG_HUNTER',
        config_id: 'UNDERDOG_HUNTER',
        display_name: 'Underdog Hunter',
        description: '55%+ trader WR, underdogs (<50¢), 5%+ edge',
        detailed_description: `**Strategy**: Hunt for mispriced underdog positions with proven traders.

**Entry Criteria**:
- Trader win rate: 55%+ confidence
- Price range: 0-50¢ (underdog positions only)
- Minimum edge: 5%
- Minimum trader experience: 30+ resolved trades

**Why This Works**: Underdogs offer higher payouts when they win. By filtering for proven traders with edge, we identify underdogs that may be mispriced.`,
        starting_balance: 1000.00,
        current_balance: 1000.00,
        bet_size: 1.20,
        model_threshold: 0.55, // Used as min trader WR
        price_min: 0.0,
        price_max: 0.50,
        min_edge: 0.05,
        use_model: true,
        min_trader_resolved_count: 30,
        is_active: true
      },
      {
        wallet_id: 'FT_FAVORITE_GRINDER',
        config_id: 'FAVORITE_GRINDER',
        display_name: 'Favorite Grinder',
        description: '60%+ trader WR, favorites (>50¢), consistent wins',
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
        model_threshold: 0.60, // Used as min trader WR
        price_min: 0.50,
        price_max: 0.90,
        min_edge: 0.03,
        use_model: false,
        min_trader_resolved_count: 30,
        is_active: true
      }
    ];
    
    const insertedWallets: string[] = [];
    const errors: string[] = [];
    
    for (const wallet of defaultWallets) {
      const { error } = await supabase
        .from('ft_wallets')
        .upsert(wallet, { onConflict: 'wallet_id' });
      
      if (error) {
        errors.push(`${wallet.wallet_id}: ${error.message}`);
      } else {
        insertedWallets.push(wallet.wallet_id);
      }
    }
    
    return NextResponse.json({
      success: errors.length === 0,
      message: `Setup complete. Inserted ${insertedWallets.length} wallets.`,
      inserted: insertedWallets,
      errors: errors.length > 0 ? errors : undefined
    });
    
  } catch (error) {
    console.error('[ft/setup] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Setup failed', details: String(error) },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'POST to this endpoint to run forward test setup',
    description: 'This will create default FT wallets if they do not exist'
  });
}
