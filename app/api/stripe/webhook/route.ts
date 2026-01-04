import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import { Resend } from 'resend'
import SubscriptionEndedEmail from '@/emails/SubscriptionEnded'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-11-17.clover',
})

// Use service role for webhook (no user context)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Initialize Resend
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

export async function POST(request: Request) {
  const body = await request.text()
  const signature = request.headers.get('stripe-signature')!

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (err) {
    console.error('Webhook signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const userId = session.metadata?.supabase_user_id

        if (userId) {
          await supabase
            .from('profiles')
            .update({ 
              is_premium: true,
              stripe_customer_id: session.customer as string,
              premium_since: new Date().toISOString(),
            })
            .eq('id', userId)
        }
        break
      }

      case 'customer.subscription.deleted':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        const customerId = subscription.customer as string

        // Find user by stripe_customer_id
        const { data: user } = await supabase
          .from('profiles')
          .select('id, email')
          .eq('stripe_customer_id', customerId)
          .single()

        if (user) {
          const isActive = subscription.status === 'active' || subscription.status === 'trialing'
          const wasDeleted = event.type === 'customer.subscription.deleted'
          
          await supabase
            .from('profiles')
            .update({ is_premium: isActive })
            .eq('id', user.id)

          // Send "subscription ended" email when subscription is deleted
          if (wasDeleted && resend) {
            try {
              const periodEnd = (subscription as any).current_period_end
              const endDate = periodEnd 
                ? new Date(periodEnd * 1000).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })
                : new Date().toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })

              const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://polycopy.app'
              
              await resend.emails.send({
                from: 'Polycopy <notifications@polycopy.app>',
                to: user.email,
                subject: 'Your Premium subscription has ended',
                react: SubscriptionEndedEmail({
                  userName: user.email.split('@')[0],
                  endDate: endDate,
                  reactivateUrl: `${appUrl}/profile`,
                })
              })

              console.log(`✅ Sent subscription ended email to ${user.email}`)
            } catch (emailError: any) {
              console.error('Failed to send subscription ended email:', emailError)
              // Don't fail the webhook if email fails
            }
          }
        }
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        const customerId = invoice.customer as string

        // Optionally: Send email notification about failed payment
        console.log(`Payment failed for customer: ${customerId}`)
        break
      }
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Webhook handler error:', error)
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 })
  }
}
