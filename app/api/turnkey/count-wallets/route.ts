import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET() {
  const userId = process.env.TURNKEY_DEV_BYPASS_USER_ID

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data, error, count } = await supabase
    .from('turnkey_wallets')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)

  return NextResponse.json({
    userId,
    walletCount: count,
    wallets: data,
    error: error?.message || null,
  })
}


