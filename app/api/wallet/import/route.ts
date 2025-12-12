import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Wallet } from '@ethersproject/wallet';
import { encryptPrivateKey, isValidPrivateKey } from '@/lib/encryption';

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

    // Get the private key from the request body
    const { privateKey } = await request.json();

    if (!privateKey) {
      return NextResponse.json(
        { error: 'Private key is required' },
        { status: 400 }
      );
    }

    // Format the private key
    let formattedKey = privateKey.trim();
    if (!formattedKey.startsWith('0x')) {
      formattedKey = '0x' + formattedKey;
    }

    // Validate the private key
    if (!isValidPrivateKey(formattedKey)) {
      return NextResponse.json(
        { error: 'Invalid private key format' },
        { status: 400 }
      );
    }

    // Verify it's a valid private key by creating a wallet
    let walletAddress: string;
    try {
      const wallet = new Wallet(formattedKey);
      walletAddress = wallet.address;
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid private key - could not create wallet' },
        { status: 400 }
      );
    }

    // Encrypt the private key for storage
    const encryptedKey = encryptPrivateKey(formattedKey);

    // Save to user's profile
    const timestamp = new Date().toISOString();
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        trading_wallet_address: walletAddress,
        encrypted_private_key: encryptedKey,
        wallet_created_at: timestamp,
        wallet_connected_at: timestamp, // Track when user imported/connected wallet
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('Database update error:', updateError);
      return NextResponse.json(
        { error: 'Failed to save wallet' },
        { status: 500 }
      );
    }

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
