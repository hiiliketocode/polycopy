import { NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { resolveOrdersTableName } from '@/lib/orders/table'

type PriceUpdate = {
  marketId: string
  outcome: string
  price: number
  resolved?: boolean
}

const createService = () =>
  createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    }
  )

export async function POST(request: Request) {
  try {
    const supabaseAuth = await createAuthClient()
    const { data: userData, error: authError } = await supabaseAuth.auth.getUser()

    if (authError) {
      console.error('Auth error refreshing prices:', authError)
    }

    const user = userData?.user
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const updates: PriceUpdate[] = Array.isArray(body?.updates) ? body.updates : []

    if (updates.length === 0) {
      return NextResponse.json({ updated: 0 })
    }

    const supabase = createService()
    const ordersTable = await resolveOrdersTableName(supabase)
    if (ordersTable !== 'orders') {
      return NextResponse.json({ error: 'Orders table unavailable' }, { status: 503 })
    }

    const now = new Date().toISOString()
    let updated = 0

    await Promise.allSettled(
      updates.map(async (update) => {
        if (!update.marketId || !update.outcome || !Number.isFinite(update.price)) return

        const payload: Record<string, any> = {
          current_price: update.price,
          last_checked_at: now,
        }

        if (update.resolved) {
          payload.market_resolved = true
          payload.market_resolved_at = now
        }

        const { error } = await supabase
          .from(ordersTable)
          .update(payload)
          .eq('copy_user_id', user.id)
          .eq('market_id', update.marketId)
          .eq('outcome', update.outcome)
          .is('user_exit_price', null)

        if (!error) {
          updated += 1
        }
      })
    )

    return NextResponse.json({ updated })
  } catch (error: any) {
    console.error('Unexpected error in /api/portfolio/refresh-prices:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error?.message || 'Unknown error' },
      { status: 500 }
    )
  }
}
