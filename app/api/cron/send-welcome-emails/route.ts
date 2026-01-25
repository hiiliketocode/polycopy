import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/resend'
import { WelcomeEmail } from '@/emails'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Minimum hours after signup before sending welcome email
const HOURS_DELAY = 2

export async function POST(request: NextRequest) {
  try {
    // Vercel Cron jobs are automatically authenticated by Vercel
    // For manual testing, you can optionally use a CRON_SECRET
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    
    // Check if it's a manual call (requires CRON_SECRET if set)
    if (cronSecret && authHeader && authHeader !== `Bearer ${cronSecret}`) {
      console.error('[Welcome Email API] Invalid credentials')
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    console.log('[Welcome Email API] Starting welcome email job...')

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    
    // Calculate cutoff time (2 hours ago)
    const cutoffTime = new Date()
    cutoffTime.setHours(cutoffTime.getHours() - HOURS_DELAY)
    const cutoffISO = cutoffTime.toISOString()
    
    console.log(`[Welcome Email API] Looking for users created before ${cutoffISO}`)
    
    // Fetch users who need welcome emails
    const { data: users, error } = await supabase
      .from('profiles')
      .select('id, email, user_name, created_at')
      .eq('welcome_email_sent', false)
      .lt('created_at', cutoffISO)
      .not('email', 'is', null)
      .limit(50) // Process in batches
    
    if (error) {
      console.error('[Welcome Email API] Error fetching users:', error)
      return NextResponse.json(
        { error: 'Database error', details: error.message },
        { status: 500 }
      )
    }
    
    if (!users || users.length === 0) {
      return NextResponse.json({
        message: 'No users need welcome emails',
        processed: 0,
      })
    }
    
    console.log(`[Welcome Email API] Found ${users.length} users to email`)
    
    let successCount = 0
    let errorCount = 0
    const errors: string[] = []
    
    // Send emails
    for (const user of users) {
      try {
        const userName = user.user_name || user.email?.split('@')[0] || 'there'
        const profileUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://polycopy.app'}/profile`
        
        console.log(`[Welcome Email API] Sending to ${user.email}...`)
        
        await sendEmail({
          to: user.email,
          subject: 'Welcome to Polycopy - Start Copying Winning Traders! 🎉',
          react: WelcomeEmail({
            userName,
            profileUrl,
          }),
        })
        
        // Mark as sent in database
        const { error: updateError } = await supabase
          .from('profiles')
          .update({
            welcome_email_sent: true,
            welcome_email_sent_at: new Date().toISOString(),
          })
          .eq('id', user.id)
        
        if (updateError) {
          console.error(`[Welcome Email API] Error updating user ${user.id}:`, updateError)
          errorCount++
          errors.push(`Failed to update ${user.email}: ${updateError.message}`)
        } else {
          console.log(`[Welcome Email API] ✅ Sent to ${user.email}`)
          successCount++
        }
        
        // Small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 100))
        
      } catch (emailError: any) {
        console.error(`[Welcome Email API] Error sending to ${user.email}:`, emailError)
        errorCount++
        errors.push(`Failed to send to ${user.email}: ${emailError.message}`)
      }
    }
    
    console.log(`[Welcome Email API] Complete! Success: ${successCount}, Errors: ${errorCount}`)
    
    return NextResponse.json({
      message: 'Welcome emails processed',
      processed: users.length,
      success: successCount,
      errors: errorCount,
      errorDetails: errors.length > 0 ? errors : undefined,
    })
    
  } catch (error: any) {
    console.error('[Welcome Email API] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
