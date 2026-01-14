import { NextResponse } from 'next/server'
import { createAdminServiceClient, getAdminSessionUser } from '@/lib/admin'

const normalizeDate = (value: string | null | undefined) => {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString()
}

const toNumber = (value: unknown, fallback: number | null = null) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export async function GET(request: Request) {
  const adminUser = await getAdminSessionUser()
  if (!adminUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const configId = searchParams.get('configId')
  const limit = Math.max(1, Math.min(200, Number(searchParams.get('limit') || '100')))

  const supabase = createAdminServiceClient()
  let query = supabase
    .from('auto_copy_logs')
    .select('*')
    .eq('copy_user_id', adminUser.id)
    .order('executed_at', { ascending: false })

  if (configId) {
    query = query.eq('config_id', configId)
  }

  const { data, error } = await query.limit(limit)

  if (error) {
    console.error('[admin/auto-copy/logs] fetch failed', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ logs: data ?? [] })
}

export async function POST(request: Request) {
  const adminUser = await getAdminSessionUser()
  if (!adminUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  if (!body || !body.configId) {
    return NextResponse.json({ error: 'Config id required' }, { status: 400 })
  }

  const supabase = createAdminServiceClient()
  const { data: config, error: configError } = await supabase
    .from('auto_copy_configs')
    .select('*')
    .eq('id', body.configId)
    .maybeSingle()

  if (configError) {
    console.error('[admin/auto-copy/logs] fetch config failed', configError)
    return NextResponse.json({ error: configError.message }, { status: 500 })
  }

  if (!config || config.copy_user_id !== adminUser.id) {
    return NextResponse.json({ error: 'Config not found' }, { status: 404 })
  }

  const size = toNumber(body.size, 1) ?? 1
  const price = toNumber(body.price, 1) ?? 1
  const amountUsd = toNumber(body.amountUsd, null) ?? (size * price)
  const executedAt = normalizeDate(body.executedAt) ?? new Date().toISOString()

  const logPayload = {
    config_id: config.id,
    copy_user_id: adminUser.id,
    trader_wallet: config.trader_wallet,
    trader_username: config.trader_username ?? null,
    trader_profile_image_url: config.trader_profile_image_url ?? null,
    market_id: body.marketId ?? null,
    market_slug: body.marketSlug ?? null,
    market_title: body.marketTitle ?? 'Auto Copy Simulation',
    market_avatar_url: body.marketAvatarUrl ?? null,
    outcome: body.outcome ?? 'Outcome',
    side: body.side ?? 'buy',
    size,
    price,
    amount_usd: amountUsd,
    allocation_usd: config.allocation_usd,
    notes: body.notes ?? 'Admin-triggered auto copy execution',
    status: body.status ?? 'executed',
    trade_method: 'auto',
    executed_at: executedAt
  }

  const { data: insertResult, error: insertError } = await supabase
    .from('auto_copy_logs')
    .insert(logPayload)
    .select('*')
    .maybeSingle()

  if (insertError) {
    console.error('[admin/auto-copy/logs] insert failed', insertError)
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  await supabase
    .from('auto_copy_configs')
    .update({ last_simulation_at: executedAt })
    .eq('id', config.id)

  return NextResponse.json({ log: insertResult ?? null })
}
