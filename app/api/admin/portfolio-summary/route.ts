import { NextResponse } from 'next/server'
import { createAdminServiceClient, getAdminSessionUser } from '@/lib/admin'

export const dynamic = 'force-dynamic'

export async function GET() {
  const adminUser = await getAdminSessionUser()
  if (!adminUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminServiceClient()

  const { data, error } = await supabase
    .from('user_portfolio_summary')
    .select('*')
    .order('total_pnl', { ascending: false })

  if (error) {
    console.error('[api/admin/portfolio-summary] failed to fetch', error)
    return NextResponse.json({ error: 'Failed to fetch portfolio summaries' }, { status: 500 })
  }

  return NextResponse.json({ rows: data ?? [] })
}
