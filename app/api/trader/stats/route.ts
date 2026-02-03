import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const wallet = searchParams.get('wallet')?.toLowerCase().trim()

  if (!wallet) {
    return NextResponse.json({ error: 'wallet is required' }, { status: 400 })
  }

  try {
    const [globalRes, profileRes] = await Promise.all([
      supabase.from('trader_global_stats').select('*').eq('wallet_address', wallet).maybeSingle(),
      supabase.from('trader_profile_stats').select('*').eq('wallet_address', wallet),
    ])

    if (globalRes.error) {
      console.error('[api/trader/stats] global error', globalRes.error)
    }
    if (profileRes.error) {
      console.error('[api/trader/stats] profile error', profileRes.error)
    }

    return NextResponse.json({
      global: globalRes.data || null,
      profiles: profileRes.data || [],
    })
  } catch (err: any) {
    console.error('[api/trader/stats] exception', err)
    return NextResponse.json({ error: err?.message || 'failed to fetch stats' }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'
