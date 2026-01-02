# Premium SMS/WhatsApp Notifications Implementation Plan

## Overview
Add SMS and WhatsApp notification options for premium users when a trader they've copied closes a position. Currently, only email notifications are sent.

## Current State Analysis

### Existing Email Notification System
- **Location**: `/app/api/cron/check-notifications/route.ts`
- **Trigger**: Vercel Cron job (runs every 5 minutes)
- **Process**:
  1. Checks `copied_trades` table for positions where trader has closed but user still holds
  2. Sends email via Resend API
  3. Marks `notification_closed_sent` flag as true
- **Email Template**: `/emails/TraderClosedPosition.tsx`

### Premium User System
- **Premium flag**: `profiles.is_premium` (boolean)
- **Stripe integration**: Already working with checkout and webhooks
- **Feature gating**: Using `tierHasPremiumAccess()` from `/lib/feature-tier.ts`

## Recommended Provider: Twilio

### Why Twilio?
1. **Unified Platform**: Single API for both SMS and WhatsApp
2. **Reliable**: Industry standard with 99.95% uptime SLA
3. **Good Documentation**: Excellent Node.js SDK
4. **Flexible**: Pay-as-you-go pricing, no monthly minimums
5. **Established**: Used by Uber, Airbnb, Netflix, etc.

### Pricing (as of 2025)
- **SMS (US)**: $0.0079 per message (~0.8¢)
- **WhatsApp Business**: 
  - Marketing: $0.0105 per message
  - Utility (our use case): $0.005 per message (~0.5¢)
  - First 1,000 conversations/month are FREE
- **Phone number rental**: $1.15/month for US number (for SMS)
- **WhatsApp Business Account**: Free to create

**Example costs at scale:**
- 100 notifications/day = $0.79/day SMS or $0.50/day WhatsApp = ~$15-24/month
- 500 notifications/day = ~$75-120/month
- 1,000 notifications/day = ~$150-240/month

**Revenue coverage**: At $20/month per premium user, just 1-2 active users covers the costs for 100 daily notifications.

### Alternative Considered
- **AWS SNS**: Cheaper ($0.00645/SMS) but no WhatsApp support
- **Vonage/Nexmo**: Similar pricing, less developer-friendly
- **MessageBird**: Good but less established
- **SendGrid SMS**: Higher pricing, better for existing SendGrid customers

## Implementation Plan

### Phase 1: Database Changes (Day 1)

#### 1.1 Add notification preferences to profiles table

```sql
-- Add columns to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS phone_number TEXT,
ADD COLUMN IF NOT EXISTS phone_country_code TEXT DEFAULT '+1',
ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS notification_method TEXT DEFAULT 'email' CHECK (notification_method IN ('email', 'sms', 'whatsapp')),
ADD COLUMN IF NOT EXISTS notification_enabled BOOLEAN DEFAULT true;

-- Add index for phone lookups
CREATE INDEX IF NOT EXISTS idx_profiles_phone_verified ON profiles(phone_verified) WHERE phone_verified = true;

-- Add updated_at trigger if not exists
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

**Migration file**: Create `/supabase/migrations/010_add_sms_notification_preferences.sql`

#### 1.2 Create phone verification tokens table

```sql
CREATE TABLE IF NOT EXISTS phone_verification_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  country_code TEXT NOT NULL DEFAULT '+1',
  verification_code TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  verified BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_phone_verification_user_id ON phone_verification_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_phone_verification_expires ON phone_verification_tokens(expires_at);

-- Auto-cleanup old tokens (older than 24 hours)
CREATE OR REPLACE FUNCTION cleanup_expired_verification_tokens()
RETURNS void AS $$
BEGIN
  DELETE FROM phone_verification_tokens
  WHERE expires_at < NOW() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql;
```

### Phase 2: Twilio Setup (Day 1)

#### 2.1 Create Twilio Account
1. Sign up at https://www.twilio.com/try-twilio
2. Verify your email
3. Get free trial credits ($15)

#### 2.2 Get Phone Number (for SMS)
1. In Twilio Console → Phone Numbers → Buy a number
2. Select country (US recommended)
3. Select capabilities: SMS, Voice (optional)
4. Cost: $1.15/month

#### 2.3 Set up WhatsApp Business
1. In Twilio Console → Messaging → Try it out → Try WhatsApp
2. Follow the setup wizard to:
   - Link your business Facebook account
   - Submit WhatsApp Business profile for approval
   - Configure message templates (required for WhatsApp)
3. **Note**: Approval can take 1-3 business days

#### 2.4 Create Message Template for WhatsApp
WhatsApp requires pre-approved templates. Submit this template:

**Template Name**: `trader_closed_position`
**Category**: Transactional
**Language**: English (US)

**Template Content**:
```
🚨 {{1}} closed their position on {{2}}

Outcome: {{3}}
Your Entry: {{4}}
Trader Exit: {{5}}
Your ROI: {{6}}

View details: {{7}}
```

**Variables**:
1. Trader username
2. Market title (truncated if > 50 chars)
3. Outcome (Yes/No)
4. User entry price
5. Trader exit price
6. User ROI percentage
7. Short URL to trade details

#### 2.5 Environment Variables

Add to `.env.local` and production:

```bash
# Twilio Configuration
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+1234567890  # Your Twilio phone number (for SMS)
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886  # Twilio WhatsApp sandbox or approved number

# Verification codes
TWILIO_VERIFICATION_CODE_EXPIRY=600  # 10 minutes in seconds
```

**Security Note**: Never commit these to Git. Add to `.gitignore`:
```
.env.local
.env*.local
```

### Phase 3: Core Implementation (Days 2-3)

#### 3.1 Create Twilio Client Utility

**File**: `/lib/twilio/client.ts`

```typescript
import twilio from 'twilio'

if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
  console.warn('⚠️ Twilio credentials not configured. SMS/WhatsApp notifications will be disabled.')
}

export const twilioClient = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
  ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null

export const TWILIO_CONFIG = {
  phoneNumber: process.env.TWILIO_PHONE_NUMBER,
  whatsappNumber: process.env.TWILIO_WHATSAPP_NUMBER,
  verificationExpiry: parseInt(process.env.TWILIO_VERIFICATION_CODE_EXPIRY || '600', 10),
}
```

#### 3.2 Create SMS/WhatsApp Service

**File**: `/lib/twilio/notifications.ts`

```typescript
import { twilioClient, TWILIO_CONFIG } from './client'

export interface TraderClosedNotification {
  traderUsername: string
  marketTitle: string
  outcome: string
  userEntryPrice: number
  traderExitPrice: number
  userROI: number
  traderROI: number
  tradeUrl: string
}

function formatPrice(price: number): string {
  const cents = Math.round(price * 100)
  return `${cents}¢`
}

function formatROI(roi: number): string {
  return `${roi >= 0 ? '+' : ''}${roi.toFixed(1)}%`
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.substring(0, maxLength - 3) + '...'
}

/**
 * Send SMS notification when trader closes position
 */
export async function sendTraderClosedSMS(
  to: string,
  data: TraderClosedNotification
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!twilioClient || !TWILIO_CONFIG.phoneNumber) {
    return { success: false, error: 'Twilio not configured' }
  }

  try {
    const message = `🚨 @${data.traderUsername} closed their position

Market: ${truncateText(data.marketTitle, 80)}
Outcome: ${data.outcome}

Your Entry: ${formatPrice(data.userEntryPrice)}
Trader Exit: ${formatPrice(data.traderExitPrice)}
Your ROI: ${formatROI(data.userROI)}

View details: ${data.tradeUrl}`

    const result = await twilioClient.messages.create({
      body: message,
      from: TWILIO_CONFIG.phoneNumber,
      to: to,
    })

    console.log(`✅ SMS sent to ${to}, SID: ${result.sid}`)
    return { success: true, messageId: result.sid }
  } catch (error: any) {
    console.error(`❌ Failed to send SMS to ${to}:`, error.message)
    return { success: false, error: error.message }
  }
}

/**
 * Send WhatsApp notification when trader closes position
 */
export async function sendTraderClosedWhatsApp(
  to: string,
  data: TraderClosedNotification
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!twilioClient || !TWILIO_CONFIG.whatsappNumber) {
    return { success: false, error: 'Twilio WhatsApp not configured' }
  }

  try {
    // Format phone number for WhatsApp (must include country code and whatsapp: prefix)
    const whatsappTo = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`

    const message = `🚨 *@${data.traderUsername}* closed their position

*Market:* ${truncateText(data.marketTitle, 80)}
*Outcome:* ${data.outcome}

*Your Entry:* ${formatPrice(data.userEntryPrice)}
*Trader Exit:* ${formatPrice(data.traderExitPrice)}
*Your ROI:* ${formatROI(data.userROI)}

View details: ${data.tradeUrl}`

    const result = await twilioClient.messages.create({
      body: message,
      from: TWILIO_CONFIG.whatsappNumber,
      to: whatsappTo,
    })

    console.log(`✅ WhatsApp sent to ${to}, SID: ${result.sid}`)
    return { success: true, messageId: result.sid }
  } catch (error: any) {
    console.error(`❌ Failed to send WhatsApp to ${to}:`, error.message)
    return { success: false, error: error.message }
  }
}

/**
 * Generate and send verification code
 */
export async function sendVerificationCode(
  to: string,
  code: string
): Promise<{ success: boolean; error?: string }> {
  if (!twilioClient || !TWILIO_CONFIG.phoneNumber) {
    return { success: false, error: 'Twilio not configured' }
  }

  try {
    const message = `Your Polycopy verification code is: ${code}\n\nThis code expires in 10 minutes.`

    await twilioClient.messages.create({
      body: message,
      from: TWILIO_CONFIG.phoneNumber,
      to: to,
    })

    console.log(`✅ Verification code sent to ${to}`)
    return { success: true }
  } catch (error: any) {
    console.error(`❌ Failed to send verification code to ${to}:`, error.message)
    return { success: false, error: error.message }
  }
}
```

#### 3.3 Update Notification Cron Job

**File**: `/app/api/cron/check-notifications/route.ts`

Add imports at the top:
```typescript
import { sendTraderClosedSMS, sendTraderClosedWhatsApp } from '@/lib/twilio/notifications'
```

Update the notification sending logic (around line 175):
```typescript
// After fetching profile and before sending email
const { data: profile } = await supabase
  .from('profiles')
  .select('email, is_premium, notification_method, notification_enabled, phone_number, phone_country_code, phone_verified')
  .eq('id', trade.user_id)
  .single()

if (!profile) {
  console.log(`⚠️ Profile not found for user ${trade.user_id}`)
  continue
}

// Check if notifications are enabled
if (!profile.notification_enabled) {
  console.log(`🔕 Notifications disabled for user ${trade.user_id}`)
  continue
}

const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://polycopy.app'
const tradeUrl = `${appUrl}/profile`
const polymarketUrl = `https://polymarket.com/event/${trade.market_id}`

const notificationData = {
  traderUsername: trade.trader_username,
  marketTitle: trade.market_title,
  outcome: trade.outcome,
  userEntryPrice: trade.price_when_copied,
  traderExitPrice: statusData.currentPrice || 0,
  userROI: statusData.roi || 0,
  traderROI,
  tradeUrl,
  polymarketUrl,
  unsubscribeUrl: `${appUrl}/profile`,
}

let notificationSent = false

// Send notification based on user preference (premium only for SMS/WhatsApp)
if (profile.is_premium && profile.notification_method === 'sms' && profile.phone_verified) {
  // Send SMS
  const fullPhoneNumber = `${profile.phone_country_code}${profile.phone_number}`
  const result = await sendTraderClosedSMS(fullPhoneNumber, notificationData)
  
  if (result.success) {
    notificationSent = true
    console.log(`✅ Sent SMS notification for trade ${trade.id} to ${fullPhoneNumber}`)
  } else {
    console.error(`❌ Failed to send SMS, falling back to email. Error: ${result.error}`)
  }
} else if (profile.is_premium && profile.notification_method === 'whatsapp' && profile.phone_verified) {
  // Send WhatsApp
  const fullPhoneNumber = `${profile.phone_country_code}${profile.phone_number}`
  const result = await sendTraderClosedWhatsApp(fullPhoneNumber, notificationData)
  
  if (result.success) {
    notificationSent = true
    console.log(`✅ Sent WhatsApp notification for trade ${trade.id} to ${fullPhoneNumber}`)
  } else {
    console.error(`❌ Failed to send WhatsApp, falling back to email. Error: ${result.error}`)
  }
}

// Fallback to email if SMS/WhatsApp fails or if user prefers email
if (!notificationSent) {
  try {
    if (!resend) {
      console.error('Resend not configured, skipping email notification')
      continue
    }
    
    await resend.emails.send({
      from: 'Polycopy <notifications@polycopy.app>',
      to: profile.email,
      subject: `${notificationData.traderUsername} closed their position`,
      react: TraderClosedPositionEmail({
        userName: profile.email.split('@')[0],
        ...notificationData,
      })
    })
    
    console.log(`✅ Sent email notification for trade ${trade.id} to ${profile.email}`)
  } catch (emailError: any) {
    console.error(`❌ Failed to send email notification:`, emailError.message)
    // Don't continue here - we want to mark as sent to prevent spam
  }
}

// Mark notification as sent
await supabase
  .from('copied_trades')
  .update({ 
    notification_closed_sent: true,
    trader_still_has_position: false
  })
  .eq('id', trade.id)

notificationsSent++
```

### Phase 4: Phone Verification API (Days 3-4)

#### 4.1 Send Verification Code API

**File**: `/app/api/phone/send-verification/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendVerificationCode } from '@/lib/twilio/notifications'
import crypto from 'crypto'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is premium
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_premium')
      .eq('id', user.id)
      .single()

    if (!profile?.is_premium) {
      return NextResponse.json({ 
        error: 'Premium subscription required for SMS/WhatsApp notifications' 
      }, { status: 403 })
    }

    const body = await request.json()
    const { phoneNumber, countryCode = '+1' } = body

    if (!phoneNumber) {
      return NextResponse.json({ error: 'Phone number is required' }, { status: 400 })
    }

    // Validate phone number format (basic validation)
    const phoneRegex = /^\d{10,15}$/
    if (!phoneRegex.test(phoneNumber.replace(/[\s-]/g, ''))) {
      return NextResponse.json({ error: 'Invalid phone number format' }, { status: 400 })
    }

    // Generate 6-digit code
    const code = crypto.randomInt(100000, 999999).toString()
    
    // Store verification token in database
    const expiresAt = new Date()
    expiresAt.setMinutes(expiresAt.getMinutes() + 10) // 10 minutes expiry

    const { error: insertError } = await supabase
      .from('phone_verification_tokens')
      .insert({
        user_id: user.id,
        phone_number: phoneNumber,
        country_code: countryCode,
        verification_code: code,
        expires_at: expiresAt.toISOString(),
      })

    if (insertError) {
      console.error('Error storing verification token:', insertError)
      return NextResponse.json({ error: 'Failed to generate verification code' }, { status: 500 })
    }

    // Send verification code via SMS
    const fullPhoneNumber = `${countryCode}${phoneNumber}`
    const result = await sendVerificationCode(fullPhoneNumber, code)

    if (!result.success) {
      return NextResponse.json({ 
        error: result.error || 'Failed to send verification code' 
      }, { status: 500 })
    }

    return NextResponse.json({ 
      success: true,
      message: 'Verification code sent successfully'
    })

  } catch (error: any) {
    console.error('Send verification error:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error.message 
    }, { status: 500 })
  }
}
```

#### 4.2 Verify Code API

**File**: `/app/api/phone/verify-code/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { phoneNumber, countryCode = '+1', code } = body

    if (!phoneNumber || !code) {
      return NextResponse.json({ 
        error: 'Phone number and verification code are required' 
      }, { status: 400 })
    }

    // Find matching verification token
    const { data: tokens, error: tokenError } = await supabase
      .from('phone_verification_tokens')
      .select('*')
      .eq('user_id', user.id)
      .eq('phone_number', phoneNumber)
      .eq('country_code', countryCode)
      .eq('verification_code', code)
      .eq('verified', false)
      .gte('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)

    if (tokenError || !tokens || tokens.length === 0) {
      return NextResponse.json({ 
        error: 'Invalid or expired verification code' 
      }, { status: 400 })
    }

    // Mark token as verified
    await supabase
      .from('phone_verification_tokens')
      .update({ verified: true })
      .eq('id', tokens[0].id)

    // Update user profile with verified phone
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        phone_number: phoneNumber,
        phone_country_code: countryCode,
        phone_verified: true,
      })
      .eq('id', user.id)

    if (updateError) {
      console.error('Error updating profile:', updateError)
      return NextResponse.json({ 
        error: 'Failed to update profile' 
      }, { status: 500 })
    }

    return NextResponse.json({ 
      success: true,
      message: 'Phone number verified successfully'
    })

  } catch (error: any) {
    console.error('Verify code error:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error.message 
    }, { status: 500 })
  }
}
```

#### 4.3 Update Notification Preferences API

**File**: `/app/api/profile/notification-preferences/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('notification_method, notification_enabled, phone_number, phone_country_code, phone_verified, is_premium')
      .eq('id', user.id)
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(profile)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { notificationMethod, notificationEnabled } = body

    // Validate notification method
    const validMethods = ['email', 'sms', 'whatsapp']
    if (notificationMethod && !validMethods.includes(notificationMethod)) {
      return NextResponse.json({ 
        error: 'Invalid notification method' 
      }, { status: 400 })
    }

    // Check if user is premium for SMS/WhatsApp
    if ((notificationMethod === 'sms' || notificationMethod === 'whatsapp')) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_premium, phone_verified')
        .eq('id', user.id)
        .single()

      if (!profile?.is_premium) {
        return NextResponse.json({ 
          error: 'Premium subscription required for SMS/WhatsApp notifications' 
        }, { status: 403 })
      }

      if (!profile?.phone_verified) {
        return NextResponse.json({ 
          error: 'Phone number must be verified first' 
        }, { status: 400 })
      }
    }

    // Update preferences
    const updates: any = {}
    if (notificationMethod !== undefined) {
      updates.notification_method = notificationMethod
    }
    if (notificationEnabled !== undefined) {
      updates.notification_enabled = notificationEnabled
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ 
      success: true,
      message: 'Notification preferences updated successfully'
    })

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
```

### Phase 5: Frontend Components (Days 4-5)

#### 5.1 Phone Number Input Component

**File**: `/temp-redesign/components/polycopy/phone-number-input.tsx`

```typescript
"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Check, Loader2, Phone } from "lucide-react"

interface PhoneNumberInputProps {
  onVerified: () => void
}

const countryCodes = [
  { code: '+1', country: 'US/Canada' },
  { code: '+44', country: 'UK' },
  { code: '+91', country: 'India' },
  { code: '+61', country: 'Australia' },
  { code: '+49', country: 'Germany' },
  { code: '+33', country: 'France' },
  // Add more as needed
]

export function PhoneNumberInput({ onVerified }: PhoneNumberInputProps) {
  const [countryCode, setCountryCode] = useState('+1')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handleSendCode = async () => {
    if (!phoneNumber) {
      setError('Please enter your phone number')
      return
    }

    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/phone/send-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber, countryCode }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send verification code')
      }

      setCodeSent(true)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyCode = async () => {
    if (!verificationCode) {
      setError('Please enter the verification code')
      return
    }

    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/phone/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber, countryCode, code: verificationCode }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Invalid verification code')
      }

      setSuccess(true)
      onVerified()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="flex items-center gap-2 p-4 bg-green-50 border border-green-200 rounded-lg">
        <Check className="h-5 w-5 text-green-600" />
        <span className="text-sm text-green-700">Phone number verified successfully!</span>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {!codeSent ? (
        <>
          <div>
            <Label htmlFor="phone">Phone Number</Label>
            <div className="flex gap-2 mt-1.5">
              <Select value={countryCode} onValueChange={setCountryCode}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {countryCodes.map((item) => (
                    <SelectItem key={item.code} value={item.code}>
                      {item.code} ({item.country})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                id="phone"
                type="tel"
                placeholder="1234567890"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ''))}
                className="flex-1"
              />
            </div>
          </div>
          
          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          <Button
            onClick={handleSendCode}
            disabled={loading || !phoneNumber}
            className="w-full"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Phone className="h-4 w-4 mr-2" />
                Send Verification Code
              </>
            )}
          </Button>
        </>
      ) : (
        <>
          <div>
            <Label htmlFor="code">Verification Code</Label>
            <p className="text-sm text-slate-600 mb-2">
              Enter the 6-digit code sent to {countryCode} {phoneNumber}
            </p>
            <Input
              id="code"
              type="text"
              placeholder="123456"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              maxLength={6}
            />
          </div>

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setCodeSent(false)
                setVerificationCode('')
                setError('')
              }}
              disabled={loading}
              className="flex-1"
            >
              Change Number
            </Button>
            <Button
              onClick={handleVerifyCode}
              disabled={loading || verificationCode.length !== 6}
              className="flex-1"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Verifying...
                </>
              ) : (
                'Verify'
              )}
            </Button>
          </div>

          <Button
            variant="link"
            onClick={handleSendCode}
            disabled={loading}
            className="w-full text-sm"
          >
            Resend code
          </Button>
        </>
      )}
    </div>
  )
}
```

#### 5.2 Notification Settings Component

**File**: `/temp-redesign/components/polycopy/notification-settings.tsx`

```typescript
"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Switch } from "@/components/ui/switch"
import { Crown, Mail, MessageSquare, Phone, Loader2, Check } from "lucide-react"
import { PhoneNumberInput } from "./phone-number-input"

interface NotificationSettingsProps {
  isPremium: boolean
}

export function NotificationSettings({ isPremium }: NotificationSettingsProps) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notificationMethod, setNotificationMethod] = useState<'email' | 'sms' | 'whatsapp'>('email')
  const [notificationEnabled, setNotificationEnabled] = useState(true)
  const [phoneVerified, setPhoneVerified] = useState(false)
  const [phoneNumber, setPhoneNumber] = useState('')
  const [showPhoneInput, setShowPhoneInput] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  useEffect(() => {
    fetchPreferences()
  }, [])

  const fetchPreferences = async () => {
    try {
      const response = await fetch('/api/profile/notification-preferences')
      const data = await response.json()
      
      if (response.ok) {
        setNotificationMethod(data.notification_method || 'email')
        setNotificationEnabled(data.notification_enabled ?? true)
        setPhoneVerified(data.phone_verified || false)
        setPhoneNumber(data.phone_number || '')
      }
    } catch (error) {
      console.error('Failed to fetch preferences:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setSaveSuccess(false)

    try {
      const response = await fetch('/api/profile/notification-preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationMethod, notificationEnabled }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to save preferences')
      }

      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (error: any) {
      alert(error.message)
    } finally {
      setSaving(false)
    }
  }

  const handleMethodChange = (value: string) => {
    const method = value as 'email' | 'sms' | 'whatsapp'
    
    if ((method === 'sms' || method === 'whatsapp') && !phoneVerified) {
      setShowPhoneInput(true)
    }
    
    setNotificationMethod(method)
  }

  const handlePhoneVerified = () => {
    setPhoneVerified(true)
    setShowPhoneInput(false)
    fetchPreferences() // Refresh to get updated phone number
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notification Preferences</CardTitle>
        <CardDescription>
          Choose how you want to receive notifications when traders you copy close their positions
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Enable/Disable Notifications */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="notifications-enabled">Enable Notifications</Label>
            <p className="text-sm text-slate-500">
              Receive alerts when traders close positions
            </p>
          </div>
          <Switch
            id="notifications-enabled"
            checked={notificationEnabled}
            onCheckedChange={setNotificationEnabled}
          />
        </div>

        {notificationEnabled && (
          <>
            {/* Notification Method */}
            <div className="space-y-3">
              <Label>Notification Method</Label>
              <RadioGroup value={notificationMethod} onValueChange={handleMethodChange}>
                {/* Email Option */}
                <div className="flex items-center space-x-3 rounded-lg border p-4">
                  <RadioGroupItem value="email" id="email" />
                  <Label htmlFor="email" className="flex items-center gap-2 cursor-pointer flex-1">
                    <Mail className="h-4 w-4" />
                    <span>Email</span>
                  </Label>
                </div>

                {/* SMS Option */}
                <div className="flex items-center space-x-3 rounded-lg border p-4 relative">
                  <RadioGroupItem value="sms" id="sms" disabled={!isPremium} />
                  <Label 
                    htmlFor="sms" 
                    className={`flex items-center gap-2 flex-1 ${!isPremium ? 'opacity-50' : 'cursor-pointer'}`}
                  >
                    <Phone className="h-4 w-4" />
                    <span>SMS Text Message</span>
                    {!isPremium && (
                      <Crown className="h-4 w-4 text-amber-500" />
                    )}
                  </Label>
                  {phoneVerified && notificationMethod === 'sms' && (
                    <Check className="h-4 w-4 text-green-600" />
                  )}
                </div>

                {/* WhatsApp Option */}
                <div className="flex items-center space-x-3 rounded-lg border p-4 relative">
                  <RadioGroupItem value="whatsapp" id="whatsapp" disabled={!isPremium} />
                  <Label 
                    htmlFor="whatsapp" 
                    className={`flex items-center gap-2 flex-1 ${!isPremium ? 'opacity-50' : 'cursor-pointer'}`}
                  >
                    <MessageSquare className="h-4 w-4" />
                    <span>WhatsApp</span>
                    {!isPremium && (
                      <Crown className="h-4 w-4 text-amber-500" />
                    )}
                  </Label>
                  {phoneVerified && notificationMethod === 'whatsapp' && (
                    <Check className="h-4 w-4 text-green-600" />
                  )}
                </div>
              </RadioGroup>

              {!isPremium && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <p className="text-sm text-amber-900">
                    <Crown className="h-4 w-4 inline mr-1" />
                    SMS and WhatsApp notifications are available with Premium
                  </p>
                </div>
              )}
            </div>

            {/* Phone Number Input (if SMS/WhatsApp selected and not verified) */}
            {((notificationMethod === 'sms' || notificationMethod === 'whatsapp') && 
              !phoneVerified && 
              showPhoneInput) && (
              <div className="border-t pt-4">
                <h4 className="font-medium mb-3">Verify Your Phone Number</h4>
                <PhoneNumberInput onVerified={handlePhoneVerified} />
              </div>
            )}

            {/* Show current phone if verified */}
            {((notificationMethod === 'sms' || notificationMethod === 'whatsapp') && phoneVerified) && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <p className="text-sm text-green-700 flex items-center gap-2">
                  <Check className="h-4 w-4" />
                  Verified phone: {phoneNumber}
                </p>
              </div>
            )}
          </>
        )}

        {/* Save Button */}
        <Button
          onClick={handleSave}
          disabled={saving || !notificationEnabled || 
            ((notificationMethod === 'sms' || notificationMethod === 'whatsapp') && !phoneVerified)}
          className="w-full"
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : saveSuccess ? (
            <>
              <Check className="h-4 w-4 mr-2" />
              Saved!
            </>
          ) : (
            'Save Preferences'
          )}
        </Button>
      </CardContent>
    </Card>
  )
}
```

#### 5.3 Add to Profile Page

**File**: `/temp-redesign/app/profile/page.tsx`

Add the notification settings section:

```typescript
import { NotificationSettings } from '@/components/polycopy/notification-settings'

// Inside your profile page component, add a new section:

<div className="space-y-6">
  {/* Existing profile sections... */}
  
  <NotificationSettings isPremium={profile?.is_premium || false} />
</div>
```

### Phase 6: Package Dependencies (Day 1)

Add Twilio SDK to package.json:

```bash
npm install twilio
npm install --save-dev @types/twilio
```

### Phase 7: Testing Plan (Days 5-6)

#### 7.1 Unit Testing
- Test phone number validation
- Test verification code generation
- Test SMS/WhatsApp sending (use Twilio sandbox)
- Test fallback to email on failure

#### 7.2 Integration Testing
1. **Phone Verification Flow**:
   - Enter phone number
   - Receive verification code
   - Verify code
   - Check database updated

2. **Notification Flow**:
   - Create copied trade
   - Simulate trader closing position
   - Verify notification sent via correct method
   - Check notification_closed_sent flag

3. **Premium Gating**:
   - Try SMS/WhatsApp as free user (should fail)
   - Upgrade to premium
   - Enable SMS/WhatsApp (should succeed)

#### 7.3 Production Testing
- Start with Twilio sandbox/test credentials
- Test with real phone numbers (your own)
- Monitor Twilio logs for delivery status
- Check costs in Twilio dashboard

### Phase 8: Documentation & Deployment (Day 6)

#### 8.1 Update Premium Features List
Update `/temp-redesign/components/polycopy/upgrade-modal.tsx`:

```typescript
const premiumFeatures = [
  "Track unlimited trades",
  "Advanced analytics and insights",
  "Real-time SMS & WhatsApp notifications", // Updated
  "Priority support",
  "Export trade history",
  "Custom alerts and filters",
  "Portfolio performance tracking",
  "Early access to new features",
]
```

#### 8.2 Deployment Checklist
- [ ] Run database migrations on production
- [ ] Add Twilio environment variables to production
- [ ] Set up WhatsApp Business account (if using WhatsApp)
- [ ] Get WhatsApp message template approved
- [ ] Test with real phone number
- [ ] Monitor first 24 hours for delivery issues
- [ ] Update FAQ/help docs
- [ ] Announce feature to users

### Phase 9: Monitoring & Optimization (Ongoing)

#### 9.1 Metrics to Track
- SMS/WhatsApp delivery success rate
- Notification delivery time
- Costs per notification
- User adoption rate (% of premium users using SMS/WhatsApp)
- User feedback

#### 9.2 Cost Optimization
- Batch notifications if multiple trades close simultaneously
- Use WhatsApp over SMS when possible (cheaper)
- Monitor for spam/abuse
- Set rate limits per user (e.g., max 50 notifications/day)

#### 9.3 Future Enhancements
- Custom notification schedules (quiet hours)
- Notification grouping/batching
- Rich notifications with images
- Two-way messaging (respond to close positions)
- Multi-language support

## Risk Mitigation

### 1. Twilio Account Suspension
**Risk**: Account flagged for spam
**Mitigation**: 
- Only send notifications user explicitly opted into
- Include clear identification and opt-out
- Follow Twilio best practices
- Start slow and ramp up

### 2. High Costs
**Risk**: Unexpected costs from high volume
**Mitigation**:
- Set up Twilio usage alerts
- Implement rate limiting per user
- Monitor costs daily initially
- Consider daily/monthly caps per user

### 3. Phone Number Privacy
**Risk**: Phone numbers leaked or misused
**Mitigation**:
- Encrypt phone numbers at rest
- Strict RLS policies
- Never expose in client-side code
- Minimal logging of phone numbers

### 4. Failed Deliveries
**Risk**: SMS/WhatsApp fails to deliver
**Mitigation**:
- Automatic fallback to email
- Log delivery failures
- Alert monitoring for high failure rates
- Retry logic for transient failures

### 5. International Support
**Risk**: Phone number format variations
**Mitigation**:
- Use libphonenumber library for validation
- Clearly show supported countries
- Test with international numbers
- Start with US only, expand gradually

## Timeline Summary

| Phase | Duration | Description |
|-------|----------|-------------|
| 1 | 1 day | Database changes |
| 2 | 1 day | Twilio setup & configuration |
| 3 | 2 days | Core notification implementation |
| 4 | 2 days | Phone verification APIs |
| 5 | 2 days | Frontend components |
| 6 | Same as 1 | Package installation |
| 7 | 2 days | Testing |
| 8 | 1 day | Documentation & deployment |
| **Total** | **8-10 days** | Full implementation |

## Success Criteria

✅ Premium users can add and verify phone numbers
✅ Premium users can choose email, SMS, or WhatsApp notifications
✅ Notifications send successfully via chosen method
✅ Fallback to email works if SMS/WhatsApp fails
✅ Non-premium users cannot access SMS/WhatsApp
✅ Phone verification is secure and reliable
✅ Costs are within acceptable range ($0.005-0.008 per notification)
✅ Delivery success rate > 95%
✅ User adoption rate > 25% within first month

## Next Steps

1. Review this plan and provide feedback
2. Run database migrations (Phase 1)
3. Set up Twilio account (Phase 2)
4. Begin implementation (Phase 3+)

