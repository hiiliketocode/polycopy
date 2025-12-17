import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * GET /api/turnkey/get-user-id?email=donraw@gmail.com
 * 
 * Dev helper to get user ID by email
 * ONLY USE IN DEVELOPMENT
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const email = searchParams.get('email')

  if (!email) {
    return NextResponse.json(
      { error: 'Email required' },
      { status: 400 }
    )
  }

  // Use service role to query auth.users
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email')
      .eq('email', email)
      .single()

    if (error) {
      // Try auth.users table directly
      const { data: authData, error: authError } = await supabase.auth.admin.listUsers()
      
      if (authError) {
        return NextResponse.json(
          { error: authError.message },
          { status: 500 }
        )
      }

      const user = authData.users.find(u => u.email === email)
      if (!user) {
        return NextResponse.json(
          { error: 'User not found' },
          { status: 404 }
        )
      }

      return NextResponse.json({
        userId: user.id,
        email: user.email,
        note: 'Add this to .env as TURNKEY_DEV_BYPASS_USER_ID'
      })
    }

    return NextResponse.json({
      userId: data.id,
      email: data.email,
      note: 'Add this to .env as TURNKEY_DEV_BYPASS_USER_ID'
    })
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    )
  }
}


