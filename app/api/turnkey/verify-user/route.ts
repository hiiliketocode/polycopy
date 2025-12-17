import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * GET /api/turnkey/verify-user
 * 
 * Verify user exists and can be used for foreign key
 */
export async function GET() {
  const userId = process.env.TURNKEY_DEV_BYPASS_USER_ID

  if (!userId) {
    return NextResponse.json({ error: 'TURNKEY_DEV_BYPASS_USER_ID not set' })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    // Check if user exists in auth.users
    const { data: authData, error: authError } = await supabase.auth.admin.getUserById(userId)
    
    // Try inserting a test record (will rollback)
    const testInsert = await supabase
      .from('turnkey_wallets')
      .insert({
        user_id: userId,
        turnkey_sub_org_id: 'test',
        turnkey_wallet_id: 'test-wallet',
        turnkey_private_key_id: '',
        eoa_address: '0x0000000000000000000000000000000000000000',
        polymarket_account_address: '',
        wallet_type: 'test',
      })
      .select()
    
    // Clean up test record
    if (testInsert.data && testInsert.data.length > 0) {
      await supabase
        .from('turnkey_wallets')
        .delete()
        .eq('wallet_type', 'test')
    }

    return NextResponse.json({
      userId,
      userExistsInAuth: !!authData?.user && !authError,
      authUser: authData?.user ? {
        id: authData.user.id,
        email: authData.user.email,
      } : null,
      testInsertSuccess: !testInsert.error,
      testInsertError: testInsert.error?.message || null,
    })
  } catch (err: any) {
    return NextResponse.json({
      error: err.message,
      userId,
    })
  }
}


