import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * POST /api/turnkey/create-profile
 * 
 * Create a profile for the user if it doesn't exist
 */
export async function POST(request: Request) {
  const { userId, email } = await request.json()

  if (!userId || !email) {
    return NextResponse.json(
      { error: 'userId and email required' },
      { status: 400 }
    )
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    // Upsert profile
    const { data, error } = await supabase
      .from('profiles')
      .upsert(
        { id: userId, email: email },
        { onConflict: 'id' }
      )
      .select()

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Profile created/updated',
      data,
    })
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    )
  }
}


