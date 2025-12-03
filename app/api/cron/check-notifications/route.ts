import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import TraderClosedPositionEmail from '@/emails/TraderClosedPosition'
import MarketResolvedEmail from '@/emails/MarketResolved'

// Create service role client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)

const resend = new Resend(process.env.RESEND_API_KEY)

// Helper to calculate trader's ROI
function calculateTraderROI(traderAvgPrice: number | null, currentPrice: number | null): number {
  if (!traderAvgPrice || !currentPrice || traderAvgPrice === 0) {
    return 0
  }
  return ((currentPrice - traderAvgPrice) / traderAvgPrice) * 100
}

/**
 * GET /api/cron/check-notifications
 * Vercel Cron job that runs every 5 minutes to check for notification triggers
 */
export async function GET(request: NextRequest) {
  // Security: Verify this is called by Vercel Cron
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    console.error('❌ Unauthorized cron request')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  console.log('🔔 Starting notification check...')
  
  try {
    // Fetch active trades that need checking
    // Only get trades where:
    // - Market is not resolved yet
    // - Haven't sent all notifications
    const { data: trades, error } = await supabase
      .from('copied_trades')
      .select('*')
      .eq('market_resolved', false)
      .or('notification_closed_sent.is.null,notification_closed_sent.eq.false')
      .limit(100)
    
    if (error) {
      console.error('Error fetching trades:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    console.log(`📊 Checking ${trades?.length || 0} trades...`)
    
    if (!trades || trades.length === 0) {
      return NextResponse.json({
        success: true,
        tradesChecked: 0,
        notificationsSent: 0,
        message: 'No trades to check'
      })
    }
    
    let notificationsSent = 0
    let tradesChecked = 0
    
    for (const trade of trades) {
      try {
        tradesChecked++
        
        // Check if user has notifications enabled
        const { data: prefs } = await supabase
          .from('notification_preferences')
          .select('email_notifications_enabled')
          .eq('user_id', trade.user_id)
          .single()
        
        // Default to enabled if no preferences set
        const notificationsEnabled = prefs?.email_notifications_enabled ?? true
        
        if (!notificationsEnabled) {
          console.log(`⏭️ Skipping trade ${trade.id} - notifications disabled`)
          continue
        }
        
        // Get user email
        const { data: profile } = await supabase
          .from('profiles')
          .select('email')
          .eq('id', trade.user_id)
          .single()
        
        if (!profile?.email) {
          console.log(`⏭️ Skipping trade ${trade.id} - no email found`)
          continue
        }
        
        // Get current status from status API
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://polycopy.app'
        const statusResponse = await fetch(
          `${appUrl}/api/copied-trades/${trade.id}/status?userId=${trade.user_id}`,
          {
            headers: {
              'Authorization': `Bearer ${process.env.CRON_SECRET}`
            }
          }
        )
        
        if (!statusResponse.ok) {
          console.error(`Failed to get status for trade ${trade.id}:`, statusResponse.status)
          continue
        }
        
        const statusData = await statusResponse.json()
        
        // Store previous state
        const oldTraderHasPosition = trade.trader_still_has_position
        const oldMarketResolved = trade.market_resolved
        
        // Get new state from status
        const newTraderHasPosition = statusData.traderStillHasPosition
        const newMarketResolved = statusData.marketResolved
        
        // Check for "Trader Closed Position" event
        if (
          oldTraderHasPosition === true && 
          newTraderHasPosition === false &&
          !trade.notification_closed_sent
        ) {
          console.log(`📧 Sending "Trader Closed" email for trade ${trade.id}`)
          
          const traderROI = calculateTraderROI(
            statusData.traderAvgPrice,
            statusData.currentPrice
          )
          
          try {
            await resend.emails.send({
              from: 'Polycopy <notifications@polycopy.app>',
              to: profile.email,
              subject: `🔔 ${trade.trader_username} closed their position`,
              react: TraderClosedPositionEmail({
                userName: profile.email.split('@')[0],
                traderUsername: trade.trader_username,
                marketTitle: trade.market_title,
                outcome: trade.outcome,
                userEntryPrice: trade.price_when_copied,
                traderExitPrice: statusData.currentPrice || 0,
                userROI: statusData.roi || 0,
                traderROI,
                tradeUrl: `${appUrl}/profile`,
                polymarketUrl: `https://polymarket.com/event/${trade.market_id}`,
                unsubscribeUrl: `${appUrl}/profile`
              })
            })
            
            // Mark notification as sent
            await supabase
              .from('copied_trades')
              .update({ 
                notification_closed_sent: true,
                trader_still_has_position: false
              })
              .eq('id', trade.id)
            
            notificationsSent++
            console.log(`✅ Sent "Trader Closed" email for trade ${trade.id}`)
          } catch (emailError) {
            console.error(`Failed to send email for trade ${trade.id}:`, emailError)
          }
        }
        
        // Check for "Market Resolved" event
        if (
          !oldMarketResolved && 
          newMarketResolved &&
          !trade.notification_resolved_sent
        ) {
          console.log(`📧 Sending "Market Resolved" email for trade ${trade.id}`)
          
          const didUserWin = (statusData.roi || 0) > 0
          const traderROI = calculateTraderROI(
            statusData.traderAvgPrice,
            statusData.currentPrice
          )
          
          try {
            await resend.emails.send({
              from: 'Polycopy <notifications@polycopy.app>',
              to: profile.email,
              subject: `✅ Market Resolved: "${trade.market_title}"`,
              react: MarketResolvedEmail({
                userName: profile.email.split('@')[0],
                marketTitle: trade.market_title,
                resolvedOutcome: statusData.resolvedOutcome || 'Unknown',
                userPosition: trade.outcome,
                userEntryPrice: trade.price_when_copied,
                userROI: statusData.roi || 0,
                traderROI,
                didUserWin,
                tradeUrl: `${appUrl}/profile`,
                unsubscribeUrl: `${appUrl}/profile`
              })
            })
            
            // Mark notification as sent and market as resolved
            await supabase
              .from('copied_trades')
              .update({ 
                notification_resolved_sent: true,
                market_resolved: true
              })
              .eq('id', trade.id)
            
            notificationsSent++
            console.log(`✅ Sent "Market Resolved" email for trade ${trade.id}`)
          } catch (emailError) {
            console.error(`Failed to send email for trade ${trade.id}:`, emailError)
          }
        }
        
        // Update last_checked_at timestamp
        await supabase
          .from('copied_trades')
          .update({ last_checked_at: new Date().toISOString() })
          .eq('id', trade.id)
        
      } catch (err) {
        console.error(`Error processing trade ${trade.id}:`, err)
      }
    }
    
    console.log(`✅ Notification check complete. Checked ${tradesChecked}, sent ${notificationsSent} emails.`)
    
    return NextResponse.json({
      success: true,
      tradesChecked,
      notificationsSent
    })
    
  } catch (error: any) {
    console.error('Error in cron job:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}

