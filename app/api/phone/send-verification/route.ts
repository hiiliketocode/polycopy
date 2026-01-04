// POST /api/phone/send-verification
// Sends a verification code to the user's phone number

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendVerificationCode } from '@/lib/twilio/send-sms'
import { isTwilioConfigured } from '@/lib/twilio/client'

// Generate 6-digit verification code
function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

export async function POST(request: NextRequest) {
  try {
    if (!isTwilioConfigured()) {
      return NextResponse.json(
        { error: 'SMS service not configured' },
        { status: 503 }
      )
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { phoneNumber } = await request.json()

    if (!phoneNumber || typeof phoneNumber !== 'string') {
      return NextResponse.json(
        { error: 'Phone number is required' },
        { status: 400 }
      )
    }

    // Validate phone number format (E.164)
    const phoneRegex = /^\+?[1-9]\d{1,14}$/
    if (!phoneRegex.test(phoneNumber)) {
      return NextResponse.json(
        { error: 'Invalid phone number format. Use E.164 format (e.g., +12025551234)' },
        { status: 400 }
      )
    }

    // Check if user is premium
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('is_premium')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'User profile not found' },
        { status: 404 }
      )
    }

    if (!profile.is_premium) {
      return NextResponse.json(
        { error: 'Phone notifications are a premium feature' },
        { status: 403 }
      )
    }

    // Generate verification code
    const code = generateVerificationCode()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes

    // Store verification code in database
    const { error: insertError } = await supabase
      .from('phone_verification_codes')
      .insert({
        user_id: user.id,
        phone_number: phoneNumber,
        code,
        expires_at: expiresAt.toISOString(),
      })

    if (insertError) {
      console.error('Error storing verification code:', insertError)
      return NextResponse.json(
        { error: 'Failed to create verification code' },
        { status: 500 }
      )
    }

    // Send SMS with verification code
    const smsResult = await sendVerificationCode(phoneNumber, code)

    if (!smsResult.success) {
      return NextResponse.json(
        { error: smsResult.error || 'Failed to send verification code' },
        { status: 500 }
      )
    }

    console.log(`✅ Verification code sent to ${phoneNumber} for user ${user.id}`)

    return NextResponse.json({
      success: true,
      message: 'Verification code sent successfully',
      expiresIn: 600, // 10 minutes in seconds
    })
  } catch (error: any) {
    console.error('Error sending verification code:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

