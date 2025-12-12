import { createRelayClient } from './polymarket-relay';
import { ClobClient } from '@dschz/polymarket-clob-client';

/**
 * Execute a trade on Polymarket on behalf of a user
 * 
 * @param userPrivateKey - User's wallet private key (from Privy embedded wallet)
 * @param marketId - Polymarket market/token ID
 * @param outcome - 'YES' or 'NO'
 * @param amount - Amount in USDC to invest
 * @param price - Price to buy/sell at (0.01 to 0.99)
 */
export async function executeTradeForUser(params: {
  userPrivateKey: string;
  marketId: string;
  outcome: 'YES' | 'NO';
  amount: number;
  price: number;
}) {
  const { userPrivateKey, marketId, outcome, amount, price } = params;
  
  try {
    // Create relay client for this user
    const relayClient = createRelayClient(userPrivateKey);
    
    // TODO: Implement trade execution using relay client
    // This will involve:
    // 1. Get market details from CLOB client
    // 2. Create order transaction
    // 3. Sign with user's wallet
    // 4. Submit via relay client
    
    console.log('Trade execution params:', {
      marketId,
      outcome,
      amount,
      price
    });
    
    return {
      success: true,
      message: 'Trade execution logic to be implemented'
    };
    
  } catch (error: any) {
    console.error('Trade execution error:', error);
    throw new Error(`Failed to execute trade: ${error.message}`);
  }
}

/**
 * Get user's wallet private key from database and decrypt it
 * This should only be called server-side when executing trades
 */
export async function getUserWalletPrivateKey(userId: string): Promise<string> {
  const { createClient } = await import('@supabase/supabase-js');
  const { decryptPrivateKey } = await import('./encryption');
  
  // Create Supabase client with service role for server-side operations
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Get the user's encrypted private key
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('encrypted_private_key')
    .eq('id', userId)
    .single();

  if (error || !profile) {
    throw new Error('User profile not found');
  }

  if (!profile.encrypted_private_key) {
    throw new Error('User has not imported a wallet');
  }

  // Decrypt and return the private key
  return decryptPrivateKey(profile.encrypted_private_key);
}
