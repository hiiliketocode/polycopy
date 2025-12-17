import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * GET /api/turnkey/check-tables
 * 
 * Check if turnkey tables exist
 */
export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    // Try to query turnkey_wallets table
    const { data, error } = await supabase
      .from('turnkey_wallets')
      .select('*')
      .limit(1)

    return NextResponse.json({
      turnkeyWalletsTableExists: !error,
      error: error?.message || null,
      sampleData: data || null,
    })
  } catch (err: any) {
    return NextResponse.json({
      turnkeyWalletsTableExists: false,
      error: err.message,
    })
  }
}


