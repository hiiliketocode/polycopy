import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

export async function GET(request: NextRequest) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: 'Supabase env vars missing' },
      { status: 500 }
    )
  }

  const tradeId = request.nextUrl.searchParams.get('tradeId')?.trim()
  if (!tradeId) {
    return NextResponse.json({ error: 'tradeId is required' }, { status: 400 })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const tables = ['trades_public', 'spl', 'trader_trades', 'TraderTrades']

  try {
    for (const table of tables) {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .eq('trade_id', tradeId)
        .limit(1)
        .maybeSingle()

      // Ignore "table not found" errors, but surface others
      if (error && error.code !== '42P01') {
        return NextResponse.json(
          { error: `Query failed on ${table}: ${error.message}` },
          { status: 500 }
        )
      }

      if (data) {
        return NextResponse.json({
          found: true,
          table,
          record: data,
        })
      }
    }

    return NextResponse.json({ found: false, message: 'Trade not found' }, { status: 404 })
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Unexpected error' },
      { status: 500 }
    )
  }
}
