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

    // Get the wallet address from the request body
    // NOTE: Privy handles private key encryption/storage on their infrastructure
    // We ONLY store the public wallet address (which is safe to store)
    const { walletAddress } = await request.json();

    if (!walletAddress) {
      return NextResponse.json(
        { error: 'Wallet address is required' },
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

    // Save only the wallet ADDRESS to user's profile
    // Private key is stored securely by Privy
    const timestamp = new Date().toISOString();
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        trading_wallet_address: walletAddress,
        wallet_connected_at: timestamp,
        // NOTE: We no longer store encrypted_private_key
        // Privy handles all private key encryption/storage
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('Database update error:', updateError);
      return NextResponse.json(
        { error: 'Failed to save wallet address' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      address: walletAddress,
      message: 'Wallet address saved successfully'
    });

  } catch (error: any) {
    console.error('Wallet save error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
