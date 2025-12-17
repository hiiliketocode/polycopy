import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * GET /api/turnkey/check-user?user_id=xxx
 * 
 * Check if user exists in both auth.users and profiles
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const userId = searchParams.get('user_id')

  if (!userId) {
    return NextResponse.json(
      { error: 'user_id required' },
      { status: 400 }
    )
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    // Check auth.users via admin API
    const { data: authData, error: authError } = await supabase.auth.admin.getUserById(userId)
    
    // Check profiles table
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    return NextResponse.json({
      userId,
      existsInAuthUsers: !!authData?.user && !authError,
      existsInProfiles: !!profileData && !profileError,
      authUser: authData?.user ? {
        id: authData.user.id,
        email: authData.user.email,
        created_at: authData.user.created_at,
      } : null,
      profile: profileData || null,
      authError: authError?.message || null,
      profileError: profileError?.message || null,
    })
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    )
  }
}


