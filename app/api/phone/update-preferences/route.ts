// POST /api/phone/update-preferences
// Updates user notification preferences for SMS/WhatsApp

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

    const { email, sms, whatsapp } = await request.json()

    // Validate preferences
    if (
      typeof email !== 'boolean' &&
      typeof sms !== 'boolean' &&
      typeof whatsapp !== 'boolean'
    ) {
      return NextResponse.json(
        { error: 'At least one preference must be provided' },
        { status: 400 }
      )
    }

    // Get current profile to check premium status
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('is_premium, phone_verified, notification_preferences')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'User profile not found' },
        { status: 404 }
      )
    }

    // Check if user is trying to enable SMS/WhatsApp without premium
    if ((sms || whatsapp) && !profile.is_premium) {
      return NextResponse.json(
        { error: 'SMS and WhatsApp notifications are premium features' },
        { status: 403 }
      )
    }

    // Check if user is trying to enable SMS/WhatsApp without verified phone
    if ((sms || whatsapp) && !profile.phone_verified) {
      return NextResponse.json(
        { error: 'Please verify your phone number first' },
        { status: 400 }
      )
    }

    // Build updated preferences
    const currentPrefs = profile.notification_preferences || {
      email: true,
      sms: false,
      whatsapp: false,
    }

    const updatedPrefs = {
      ...currentPrefs,
      ...(typeof email === 'boolean' && { email }),
      ...(typeof sms === 'boolean' && { sms }),
      ...(typeof whatsapp === 'boolean' && { whatsapp }),
    }

    // Update preferences
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ notification_preferences: updatedPrefs })
      .eq('id', user.id)

    if (updateError) {
      console.error('Error updating preferences:', updateError)
      return NextResponse.json(
        { error: 'Failed to update preferences' },
        { status: 500 }
      )
    }

    console.log(`✅ Notification preferences updated for user ${user.id}:`, updatedPrefs)

    return NextResponse.json({
      success: true,
      message: 'Preferences updated successfully',
      preferences: updatedPrefs,
    })
  } catch (error: any) {
    console.error('Error updating preferences:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('notification_preferences, phone_number, phone_verified, is_premium')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'User profile not found' },
        { status: 404 }
      )
    }

    const preferences = profile.notification_preferences || {
      email: true,
      sms: false,
      whatsapp: false,
    }

    return NextResponse.json({
      success: true,
      preferences,
      phoneNumber: profile.phone_number,
      phoneVerified: profile.phone_verified,
      isPremium: profile.is_premium,
    })
  } catch (error: any) {
    console.error('Error fetching preferences:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

