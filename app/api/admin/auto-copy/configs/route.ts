import { NextResponse } from 'next/server'
import { createAdminServiceClient, getAdminSessionUser } from '@/lib/admin'

const clampNumber = (value: number, min: number, max: number) => {
  if (!Number.isFinite(value)) return null
  return Math.min(Math.max(value, min), max)
}

const normalizeDate = (value: string | null | undefined) => {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

export async function GET(request: Request) {
  const adminUser = await getAdminSessionUser()
  if (!adminUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const requestedLimit = Math.max(1, Math.min(100, Number(searchParams.get('limit') || '50')))
  const supabase = createAdminServiceClient()
  const { data, error } = await supabase
    .from('auto_copy_configs')
    .select('*')
    .eq('copy_user_id', adminUser.id)
    .order('updated_at', { ascending: false })
    .limit(requestedLimit)

  if (error) {
    console.error('[admin/auto-copy/configs] fetch failed', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ configs: data ?? [] })
}

export async function POST(request: Request) {
  const adminUser = await getAdminSessionUser()
  if (!adminUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const traderWallet = (body.traderWallet ?? '').toString().trim().toLowerCase()
  if (!traderWallet) {
    return NextResponse.json({ error: 'Trader wallet required' }, { status: 400 })
  }

  const minPct = clampNumber(Number(body.minTradeSizePct ?? 2), 0, 100)
  const maxPct = clampNumber(Number(body.maxTradeSizePct ?? 25), 0, 100)
  if (minPct === null || maxPct === null || minPct > maxPct) {
    return NextResponse.json({ error: 'Invalid trade size range' }, { status: 400 })
  }

  const safeAllocationUsd = Number(body.allocationUsd ?? 500)
  const safeMaxTradesPerDay = Number(body.maxTradesPerDay ?? 10)
  const riskTolerancePct = clampNumber(Number(body.riskTolerancePct ?? 5), 0, 100)
  const timeWindowStart = normalizeDate(body.timeWindowStart)
  const timeWindowEnd = normalizeDate(body.timeWindowEnd)

  const payload = {
    copy_user_id: adminUser.id,
    trader_wallet: traderWallet,
    trader_username: body.traderUsername ?? null,
    trader_profile_image_url: body.traderProfileImageUrl ?? null,
    min_trade_size_pct: minPct,
    max_trade_size_pct: maxPct,
    allocation_usd: Number.isFinite(safeAllocationUsd) ? safeAllocationUsd : 500,
    max_trades_per_day: Number.isFinite(safeMaxTradesPerDay)
      ? Math.max(1, Math.floor(safeMaxTradesPerDay))
      : 10,
    risk_tolerance_pct: riskTolerancePct === null ? 0 : riskTolerancePct,
    time_window_start: timeWindowStart,
    time_window_end: timeWindowEnd,
    paused: Boolean(body.paused),
    notes: body.notes ?? null,
    last_simulation_at: normalizeDate(body.lastSimulationAt) ?? null
  }

  const supabase = createAdminServiceClient()
  const { data, error } = await supabase
    .from('auto_copy_configs')
    .upsert(payload, {
      onConflict: 'copy_user_id,trader_wallet',
      returning: 'representation'
    })

  if (error) {
    console.error('[admin/auto-copy/configs] upsert failed', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ config: data?.[0] ?? null })
}

export async function PATCH(request: Request) {
  const adminUser = await getAdminSessionUser()
  if (!adminUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  if (!body || !body.configId) {
    return NextResponse.json({ error: 'Config id required' }, { status: 400 })
  }

  const supabase = createAdminServiceClient()
  const { data: existing, error: fetchError } = await supabase
    .from('auto_copy_configs')
    .select('*')
    .eq('id', body.configId)
    .maybeSingle()

  if (fetchError) {
    console.error('[admin/auto-copy/configs] fetch failed', fetchError)
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  if (!existing || existing.copy_user_id !== adminUser.id) {
    return NextResponse.json({ error: 'Config not found' }, { status: 404 })
  }

  const updates: Record<string, any> = {}
  const applyNumberField = (key: string, value: any, fallback: number | null = null) => {
    if (value === undefined || value === null) return
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) return
    updates[key] = parsed
  }

  applyNumberField('min_trade_size_pct', body.minTradeSizePct)
  applyNumberField('max_trade_size_pct', body.maxTradeSizePct)
  applyNumberField('allocation_usd', body.allocationUsd)
  applyNumberField('max_trades_per_day', body.maxTradesPerDay !== undefined ? Math.max(1, Math.floor(Number(body.maxTradesPerDay))) : undefined)
  applyNumberField('risk_tolerance_pct', body.riskTolerancePct)

  if (body.traderUsername !== undefined) {
    updates.trader_username = body.traderUsername ?? null
  }
  if (body.traderProfileImageUrl !== undefined) {
    updates.trader_profile_image_url = body.traderProfileImageUrl ?? null
  }
  if (body.notes !== undefined) {
    updates.notes = body.notes ?? null
  }
  if (body.paused !== undefined) {
    updates.paused = Boolean(body.paused)
  }
  if (body.timeWindowStart !== undefined) {
    updates.time_window_start = normalizeDate(body.timeWindowStart)
  }
  if (body.timeWindowEnd !== undefined) {
    updates.time_window_end = normalizeDate(body.timeWindowEnd)
  }
  if (body.lastSimulationAt !== undefined) {
    updates.last_simulation_at = normalizeDate(body.lastSimulationAt)
  }

  if (updates.min_trade_size_pct !== undefined && updates.max_trade_size_pct !== undefined) {
    if (updates.min_trade_size_pct > updates.max_trade_size_pct) {
      return NextResponse.json({ error: 'Min cannot exceed max' }, { status: 400 })
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No changes provided' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('auto_copy_configs')
    .update(updates)
    .eq('id', body.configId)
    .limit(1)
    .select('*')
    .maybeSingle()

  if (error) {
    console.error('[admin/auto-copy/configs] update failed', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ config: data ?? null })
}
