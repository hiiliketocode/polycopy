import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/turnkey/auth-test
 * 
 * Simple endpoint to test if Supabase authentication is working
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError) {
      return NextResponse.json({
        authenticated: false,
        error: authError.message,
        user: null,
      })
    }

    if (!user) {
      return NextResponse.json({
        authenticated: false,
        error: 'No user session found',
        user: null,
      })
    }

    return NextResponse.json({
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
      },
    })
  } catch (error: any) {
    return NextResponse.json(
      {
        authenticated: false,
        error: error.message || 'Unknown error',
      },
      { status: 500 }
    )
  }
}


