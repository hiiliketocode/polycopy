import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'

const createService = () =>
  createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  )

export async function GET(request: Request) {
  const supabaseAuth = await createAuthClient()
  const {
    data: { user },
    error: authError
  } = await supabaseAuth.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const limit = Math.max(1, Math.min(200, Number(searchParams.get('limit') || '100')))

  const supabase = createService()
  const { data, error } = await supabase
    .from('auto_copy_logs')
    .select('*')
    .eq('copy_user_id', user.id)
    .order('executed_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[auto-copy/logs] fetch failed', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ logs: data ?? [] })
}
