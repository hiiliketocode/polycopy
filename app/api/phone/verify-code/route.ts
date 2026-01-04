// POST /api/phone/verify-code
// Verifies a phone number using the verification code

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { phoneNumber, code } = await request.json()

    if (!phoneNumber || !code) {
      return NextResponse.json(
        { error: 'Phone number and code are required' },
        { status: 400 }
      )
    }

    // Find valid verification code
    const { data: verificationCodes, error: fetchError } = await supabase
      .from('phone_verification_codes')
      .select('*')
      .eq('user_id', user.id)
      .eq('phone_number', phoneNumber)
      .eq('code', code)
      .eq('verified', false)
      .gte('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)

    if (fetchError) {
      console.error('Error fetching verification code:', fetchError)
      return NextResponse.json(
        { error: 'Failed to verify code' },
        { status: 500 }
      )
    }

    if (!verificationCodes || verificationCodes.length === 0) {
      return NextResponse.json(
        { error: 'Invalid or expired verification code' },
        { status: 400 }
      )
    }

    const verificationCode = verificationCodes[0]

    // Mark code as verified
    const { error: updateCodeError } = await supabase
      .from('phone_verification_codes')
      .update({ verified: true })
      .eq('id', verificationCode.id)

    if (updateCodeError) {
      console.error('Error updating verification code:', updateCodeError)
    }

    // Update user profile with verified phone number
    const { error: updateProfileError } = await supabase
      .from('profiles')
      .update({
        phone_number: phoneNumber,
        phone_verified: true,
        phone_verified_at: new Date().toISOString(),
      })
      .eq('id', user.id)

    if (updateProfileError) {
      console.error('Error updating profile:', updateProfileError)
      return NextResponse.json(
        { error: 'Failed to update profile' },
        { status: 500 }
      )
    }

    console.log(`✅ Phone number verified for user ${user.id}: ${phoneNumber}`)

    return NextResponse.json({
      success: true,
      message: 'Phone number verified successfully',
      phoneNumber,
    })
  } catch (error: any) {
    console.error('Error verifying code:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

