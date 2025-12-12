import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Create Supabase client with service role for server-side operations
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
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

    // Get wallet information from request
    // Privy handles private key encryption/storage on their infrastructure
    // We ONLY store reference IDs and public addresses
    const { walletId, walletAddress } = await request.json();

    if (!walletId || !walletAddress) {
      return NextResponse.json(
        { error: 'Wallet ID and address are required' },
        { status: 400 }
      );
    }

    // Validate it's a valid Ethereum address
    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return NextResponse.json(
        { error: 'Invalid wallet address format' },
        { status: 400 }
      );
    }

    // Save wallet reference to user's profile
    // - privy_wallet_id: Reference ID (not sensitive)
    // - trading_wallet_address: Public address (not sensitive)
    // - Private key: Stored by Privy (never in our DB)
    const timestamp = new Date().toISOString();
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        privy_wallet_id: walletId,
        trading_wallet_address: walletAddress,
        wallet_connected_at: timestamp,
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('Database update error:', updateError);
      return NextResponse.json(
        { error: 'Failed to save wallet information' },
        { status: 500 }
      );
    }

    console.log(`✅ Saved wallet for user ${user.id}: ${walletAddress}`);

    return NextResponse.json({
      success: true,
      address: walletAddress,
      message: 'Wallet imported successfully'
    });

  } catch (error: any) {
    console.error('Wallet import error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
