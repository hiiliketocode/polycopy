import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

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

        if (userId) {
          // Upgrade user to premium
          await supabase
            .from('profiles')
            .update({ 
              is_premium: true,
              stripe_customer_id: session.customer as string,
              premium_since: new Date().toISOString(),
            })
            .eq('id', userId)

          console.log('✅ User upgraded to premium:', userId)

          // Log initial payment for analytics (if amount exists)
          if (session.amount_total && session.invoice) {
            await supabase
              .from('payment_history')
              .insert({
                user_id: userId,
                stripe_invoice_id: session.invoice as string,
                stripe_subscription_id: session.subscription as string || null,
                stripe_customer_id: session.customer as string,
                amount_cents: session.amount_total,
                currency: session.currency || 'usd',
                status: 'succeeded',
                payment_type: 'initial',
              })

            console.log('✅ Initial payment logged for analytics')
          }
        }
        break
      }

      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent & { invoice?: string }
        
        // Get subscription from payment intent
        const invoiceId = paymentIntent.invoice
        if (invoiceId && typeof invoiceId === 'string') {
          const invoice = await stripe.invoices.retrieve(invoiceId) as Stripe.Invoice & { subscription?: string }
          const subscriptionId = invoice.subscription
          
          if (subscriptionId && typeof subscriptionId === 'string') {
            const subscription = await stripe.subscriptions.retrieve(subscriptionId)
            const userId = subscription.metadata?.supabase_user_id
            
            if (userId) {
              console.log('✅ Payment successful, upgrading user:', userId)
              
              await supabase
                .from('profiles')
                .update({ 
                  is_premium: true,
                  stripe_customer_id: subscription.customer as string,
                  premium_since: new Date().toISOString(),
                })
                .eq('id', userId)
              
              console.log('✅ User upgraded to premium')
            }
          }
        }
        break
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent
        console.error('❌ Payment failed:', paymentIntent.id, paymentIntent.last_payment_error?.message)
        // Optionally: Send email notification about failed payment
        break
      }

      case 'customer.subscription.deleted':
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
          await supabase
            .from('profiles')
            .update({ is_premium: isActive })
            .eq('id', user.id)
        }
        break
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice & { subscription?: string }
        const customerId = invoice.customer as string
        const subscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : null

        // Find user by stripe_customer_id
        const { data: user } = await supabase
          .from('profiles')
          .select('id, email')
          .eq('stripe_customer_id', customerId)
          .single()

        if (user) {
          console.log('💰 Payment succeeded for user:', user.id)
          console.log('📊 Invoice details:', {
            amount: invoice.amount_paid / 100, // Convert cents to dollars
            currency: invoice.currency,
            subscription: subscriptionId,
            invoice_id: invoice.id,
          })

          // Determine if this is initial payment or renewal
          const isInitialPayment = invoice.billing_reason === 'subscription_create'
          
          // Save payment to history for analytics
          const { error: paymentError } = await supabase
            .from('payment_history')
            .insert({
              user_id: user.id,
              stripe_invoice_id: invoice.id,
              stripe_subscription_id: subscriptionId,
              stripe_customer_id: customerId,
              amount_cents: invoice.amount_paid,
              currency: invoice.currency,
              status: 'succeeded',
              payment_type: isInitialPayment ? 'initial' : 'renewal',
            })

          if (paymentError) {
            console.error('❌ Error saving payment history:', paymentError)
          } else {
            console.log('✅ Payment saved to history for analytics')
          }

          // TODO: Future enhancements:
          // 1. Send "payment received" confirmation email to user.email
          // 2. Update business intelligence dashboard
          // 3. Send Slack notification for new revenue
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
