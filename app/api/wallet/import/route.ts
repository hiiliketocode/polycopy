import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createAuthClient } from '@/lib/supabase/server';

// Create Supabase client with service role for database operations (bypassing RLS)
const supabaseServiceRole = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    // Get the current user's session from cookies using auth client
    const supabaseAuth = await createAuthClient();
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    
    if (authError || !user) {
      console.error('🔐 Auth error:', authError);
      return NextResponse.json(
        { error: 'Unauthorized - please log in' },
        { status: 401 }
      );
    }

    console.log('✅ User authenticated:', user.id);

    // Get the wallet address from request body
    // NOTE: Privy handles private key import client-side via their UI
    // We only receive and store the public wallet address
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

    console.log(`📝 Saving wallet address for user: ${user.id}`);

    // Save only the wallet address to our database
    // Privy stores the private key securely on their infrastructure
    // Use service role client to bypass RLS
    const timestamp = new Date().toISOString();
    const { error: updateError } = await supabaseServiceRole
      .from('profiles')
      .update({
        trading_wallet_address: walletAddress,
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

    console.log(`✅ Saved wallet address to database: ${walletAddress}`);

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
