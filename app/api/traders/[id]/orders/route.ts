import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false }
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const url = new URL(request.url)
  const limitParam = parseInt(url.searchParams.get('limit') || '', 10)
  const offsetParam = parseInt(url.searchParams.get('offset') || '', 10)

  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 100) : 50
  const offset = Number.isFinite(offsetParam) && offsetParam >= 0 ? offsetParam : 0

  if (!id) {
    return NextResponse.json({ error: 'Missing trader id' }, { status: 400 })
  }

  const { data: orders, error } = await supabase
    .from('orders')
    .select('order_id, market_id, outcome, side, order_type, price, size, filled_size, remaining_size, status, created_at, updated_at')
    .eq('trader_id', id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    console.error('[trader-orders] query error', error)
    return NextResponse.json({ error: 'Failed to load orders' }, { status: 500 })
  }

  // Optionally count fills per order (cheap summary)
  const orderIds = orders?.map((o) => o.order_id) || []
  let fillsByOrder: Record<string, number> = {}

  if (orderIds.length > 0) {
    const fillsBuilder = supabase.from('fills') as any
    const { data: fills } = await fillsBuilder
      .select('order_id, count:fill_id')
      .in('order_id', orderIds)
      .group('order_id')

    fillsByOrder = (fills || []).reduce((acc: any, row: any) => {
      acc[row.order_id] = row.count
      return acc
    }, {})
  }

  const formatted = (orders || []).map((o) => ({
    ...o,
    fills_count: fillsByOrder[o.order_id] || 0
  }))

  return NextResponse.json({ orders: formatted })
}
