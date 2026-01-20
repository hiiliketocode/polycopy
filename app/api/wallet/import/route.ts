import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAuthClient } from '@/lib/supabase/server';
import { validateEthereumAddress } from '@/lib/validation/input';
import { unauthorized, internalError } from '@/lib/http/error-response';

/**
 * SECURITY NOTE: This endpoint previously used service role to bypass RLS.
 * Changed to use authenticated client because:
 * - User is updating THEIR OWN profile record
 * - RLS policies on `profiles` table allow users to update own records
 * - Using service role here was unnecessary and bypassed security controls
 * 
 * Fixed: January 10, 2025
 */

export async function POST(request: NextRequest) {
  try {
    // Get the current user's session from cookies using auth client
    const supabase = await createAuthClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      console.error('🔐 Auth error:', authError);
      return NextResponse.json(
        { error: 'Unauthorized - please log in' },
        { status: 401 }
      );
    }

    console.log('✅ User authenticated:', user.id);

    // Get the wallet address from request body
    // NOTE: Turnkey handles private key import client-side via their UI
    // We only receive and store the public wallet address
    const { walletAddress } = await request.json();

    if (!walletAddress) {
      return NextResponse.json(
        { error: 'Wallet address is required' },
        { status: 400 }
      );
    }

    // SECURITY: Validate Ethereum address format
    const addressValidation = validateEthereumAddress(walletAddress);
    if (!addressValidation.valid) {
      console.error('❌ Invalid wallet address:', addressValidation.error);
      return NextResponse.json(
        { error: addressValidation.error },
        { status: 400 }
      );
    }

    // Use sanitized (lowercase, validated) address
    const sanitizedAddress = addressValidation.sanitized!;

    console.log(`📝 Saving wallet address for user: ${user.id}`);

    // SECURITY FIX: Use authenticated client instead of service role
    // RLS policies allow users to update their own profiles
    const timestamp = new Date().toISOString();
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        trading_wallet_address: sanitizedAddress,
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

    console.log(`✅ Saved wallet address to database: ${sanitizedAddress}`);

    return NextResponse.json({
      success: true,
      address: sanitizedAddress,
      message: 'Wallet imported successfully'
    });

  } catch (error: any) {
    return internalError('Wallet import failed', error);
  }
}
