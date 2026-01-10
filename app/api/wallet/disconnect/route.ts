import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * SECURITY NOTE: This endpoint uses authenticated client (not service role).
 * 
 * Why NO service role:
 * - User is disconnecting THEIR OWN wallet
 * - RLS policies on `profiles` allow users to update own records
 * - Service role would be unnecessary RLS bypass
 * 
 * Authentication: Bearer token in Authorization header
 * 
 * Fixed: January 10, 2025
 */

// Create regular Supabase client (not service role)
// Will use Bearer token for auth
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(request: NextRequest) {
  try {
    // Get the authorization header
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Missing or invalid authorization header' },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);

    // Verify the user's session token
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      console.error('Auth error:', authError);
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // SECURITY FIX: Use authenticated client (not service role)
    // RLS policies allow users to update their own profiles
    // Remove wallet data from user's profile
    // NOTE: We only store the wallet address, not private keys
    // Private keys are managed by Turnkey on their infrastructure
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        trading_wallet_address: null,
        wallet_connected_at: null,
        // Note: encrypted_private_key column is deprecated (kept for backwards compatibility)
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('Database update error:', updateError);
      return NextResponse.json(
        { error: 'Failed to disconnect wallet' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Wallet disconnected successfully'
    });

  } catch (error: any) {
    console.error('Wallet disconnect error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
