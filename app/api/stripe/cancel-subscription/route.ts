// POST /api/stripe/cancel-subscription
// Cancels a user's Stripe subscription

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-11-17.clover',
})

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { reason, feedback } = await request.json()

    // Get user's Stripe customer ID
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('stripe_customer_id, is_premium')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'User profile not found' },
        { status: 404 }
      )
    }

    if (!profile.is_premium || !profile.stripe_customer_id) {
      return NextResponse.json(
        { error: 'No active premium subscription found' },
        { status: 400 }
      )
    }

    // Find active subscription
    const subscriptions = await stripe.subscriptions.list({
      customer: profile.stripe_customer_id,
      status: 'active',
      limit: 1,
    })

    if (subscriptions.data.length === 0) {
      return NextResponse.json(
        { error: 'No active subscription found' },
        { status: 404 }
      )
    }

    const subscription = subscriptions.data[0]

    // Cancel subscription at period end (user keeps access until then)
    const canceledSubscription = await stripe.subscriptions.update(
      subscription.id,
      {
        cancel_at_period_end: true,
        cancellation_details: {
          comment: feedback || undefined,
          feedback: reason as Stripe.SubscriptionUpdateParams.CancellationDetails.Feedback,
        },
      }
    )

    const periodEnd = (canceledSubscription as any).current_period_end || (subscription as any).current_period_end
    console.log(`✅ Subscription ${subscription.id} canceled for user ${user.id}`)
    console.log(`Access until: ${new Date(periodEnd * 1000).toISOString()}`)

    // Log cancellation reason in database (optional - for analytics)
    if (reason || feedback) {
      await supabase.from('subscription_cancellations').insert({
        user_id: user.id,
        stripe_subscription_id: subscription.id,
        reason,
        feedback,
        canceled_at: new Date().toISOString(),
        access_until: new Date(periodEnd * 1000).toISOString(),
      })
    }

    return NextResponse.json({
      success: true,
      message: 'Subscription canceled successfully',
      access_until: new Date(periodEnd * 1000).toISOString(),
    })
  } catch (error: any) {
    console.error('Error canceling subscription:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to cancel subscription' },
      { status: 500 }
    )
  }
}

