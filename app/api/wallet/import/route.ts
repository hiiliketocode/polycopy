import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Create Supabase client with service role for server-side operations
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    // Get the current user's session from cookies
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      console.error('Auth error:', authError);
      return NextResponse.json(
        { error: 'Unauthorized - please log in' },
        { status: 401 }
      );
    }

    // Get the private key from request body
    const { privateKey } = await request.json();

    if (!privateKey) {
      return NextResponse.json(
        { error: 'Private key is required' },
        { status: 400 }
      );
    }

    // Validate private key format (0x + 64 hex chars = 66 total)
    if (!privateKey.startsWith('0x') || privateKey.length !== 66) {
      return NextResponse.json(
        { error: 'Invalid private key format. Must be 66 characters (0x + 64 hex)' },
        { status: 400 }
      );
    }

    console.log(`📤 Importing wallet to Privy for user: ${user.id}`);

    // Import wallet via Privy's REST API
    // The private key is sent securely to Privy (never stored by us)
    const privyResponse = await fetch('https://auth.privy.io/api/v1/wallets', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'privy-app-id': process.env.NEXT_PUBLIC_PRIVY_APP_ID!,
        'privy-app-secret': process.env.PRIVY_APP_SECRET!,
      },
      body: JSON.stringify({
        user_id: user.id, // Link to current user
        chain_type: 'ethereum',
        wallet_type: 'imported',
        private_key: privateKey,
      }),
    });

    if (!privyResponse.ok) {
      const error = await privyResponse.json();
      console.error('Privy API error:', error);
      throw new Error(error.message || 'Failed to import wallet to Privy');
    }

    const wallet = await privyResponse.json();
    console.log(`✅ Wallet imported to Privy: ${wallet.address}`);

    // Save only the wallet address to our database (not the private key!)
    // Privy stores the private key securely on their infrastructure
    const timestamp = new Date().toISOString();
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        trading_wallet_address: wallet.address,
        wallet_connected_at: timestamp,
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('Database update error:', updateError);
      return NextResponse.json(
        { error: 'Failed to save wallet address to database' },
        { status: 500 }
      );
    }

    console.log(`✅ Saved wallet address to database: ${wallet.address}`);

    return NextResponse.json({
      success: true,
      address: wallet.address,
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
