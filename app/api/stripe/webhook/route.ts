import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import { sendEmail, EMAIL_FROM } from '@/lib/resend'
import { 
  PremiumSubscriptionConfirmationEmail,
  SubscriptionCancellationConfirmationEmail 
} from '@/emails'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-11-17.clover',
})

// Use service role for webhook (no user context)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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
        const customerId = session.customer as string

        if (userId) {
          // Update user profile
          await supabase
            .from('profiles')
            .update({ 
              is_premium: true,
              stripe_customer_id: customerId,
              premium_since: new Date().toISOString(),
            })
            .eq('id', userId)

          // Get user details for email
          const { data: profile } = await supabase
            .from('profiles')
            .select('email, user_name')
            .eq('id', userId)
            .single()

          if (profile?.email) {
            // Get subscription details
            const subscriptions = await stripe.subscriptions.list({
              customer: customerId,
              limit: 1,
            })

            const subscription = subscriptions.data[0]
            const interval = subscription?.items.data[0]?.price?.recurring?.interval

            // Send welcome email
            try {
              await sendEmail({
                to: profile.email,
                subject: 'Welcome to Polycopy Premium! 🎉',
                react: PremiumSubscriptionConfirmationEmail({
                  userName: profile.user_name || 'there',
                  subscriptionDate: new Date().toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  }),
                  billingPeriod: interval === 'year' ? 'annual' : 'monthly',
                  amount: `$${(subscription?.items.data[0]?.price?.unit_amount || 0) / 100}`,
                  profileUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'https://polycopy.app'}/profile`,
                }),
              })
              console.log('✅ Premium confirmation email sent to:', profile.email)
            } catch (emailError) {
              console.error('❌ Failed to send premium confirmation email:', emailError)
            }
          }
        }
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription & { current_period_end: number }
        const customerId = subscription.customer as string

        // Find user by stripe_customer_id
        const { data: user } = await supabase
          .from('profiles')
          .select('id, email, user_name')
          .eq('stripe_customer_id', customerId)
          .single()

        if (user) {
          // Update premium status to false
          await supabase
            .from('profiles')
            .update({ is_premium: false })
            .eq('id', user.id)

          // **AUTO-DISCONNECT WALLET**: Delete wallet connection and credentials
          console.log(`🔒 Auto-disconnecting wallet for user ${user.id} (premium downgrade)`)
          
          // Delete from turnkey_wallets
          const { error: walletDeleteError } = await supabase
            .from('turnkey_wallets')
            .delete()
            .eq('user_id', user.id)

          if (walletDeleteError) {
            console.error('❌ Failed to delete turnkey wallet:', walletDeleteError)
          } else {
            console.log('✅ Turnkey wallet deleted')
          }

          // Delete from clob_credentials
          const { error: credDeleteError } = await supabase
            .from('clob_credentials')
            .delete()
            .eq('user_id', user.id)

          if (credDeleteError) {
            console.error('❌ Failed to delete clob credentials:', credDeleteError)
          } else {
            console.log('✅ CLOB credentials deleted')
          }

          // Send cancellation confirmation email
          if (user.email) {
            try {
              const currentPeriodEnd = subscription.current_period_end || 0
              await sendEmail({
                to: user.email,
                subject: 'Your Polycopy Premium subscription has been canceled',
                react: SubscriptionCancellationConfirmationEmail({
                  userName: user.user_name || 'there',
                  cancellationDate: new Date().toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  }),
                  accessUntil: new Date(currentPeriodEnd * 1000).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  }),
                  profileUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'https://polycopy.app'}/profile`,
                }),
              })
              console.log('✅ Cancellation confirmation email sent to:', user.email)
            } catch (emailError) {
              console.error('❌ Failed to send cancellation email:', emailError)
            }
          }
        }
        break
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        const customerId = subscription.customer as string

        // Find user by stripe_customer_id
        const { data: user } = await supabase
          .from('profiles')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .single()

        if (user) {
          const isActive = subscription.status === 'active' || subscription.status === 'trialing'
          
          // If subscription is being canceled (but still active until period end), don't downgrade yet
          const willCancel = subscription.cancel_at_period_end
          
          if (!isActive && !willCancel) {
            // Only downgrade if subscription is truly inactive
            await supabase
              .from('profiles')
              .update({ is_premium: false })
              .eq('id', user.id)
          } else if (isActive) {
            // Reactivate if they cancelled the cancellation
            await supabase
              .from('profiles')
              .update({ is_premium: true })
              .eq('id', user.id)
          }
        }
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        const customerId = invoice.customer as string

        // Optionally: Send email notification about failed payment
        console.log(`⚠️ Payment failed for customer: ${customerId}`)
        
        // TODO: Could send a payment failure email here
        break
      }
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Webhook handler error:', error)
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 })
  }
}
