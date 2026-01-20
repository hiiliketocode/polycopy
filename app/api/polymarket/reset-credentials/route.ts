import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

export async function POST() {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json(
      { error: 'Unauthorized - please log in' },
      { status: 401 }
    )
  }

  const supabaseServiceRole = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    // Delete CLOB credentials for this user
    const { error: deleteError } = await supabaseServiceRole
      .from('clob_credentials')
      .delete()
      .eq('user_id', user.id)

    if (deleteError) {
      console.error('[RESET-CREDS] Delete error:', deleteError)
      return NextResponse.json(
        { error: 'Failed to delete credentials' },
        { status: 500 }
      )
    }

    console.log('[RESET-CREDS] Successfully deleted CLOB credentials for user:', user.id)

    return NextResponse.json({
      success: true,
      message: 'CLOB credentials deleted. Please reconnect your wallet to generate new credentials.'
    })
  } catch (error: any) {
    console.error('[RESET-CREDS] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

