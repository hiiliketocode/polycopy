/**
 * Backfill Subscription Data
 * 
 * This script populates subscription_amount, subscription_status, and stripe_subscription_id
 * for existing premium users by querying Stripe API.
 * 
 * Run this ONCE after the migration to backfill historical data.
 */

import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-11-17.clover',
})

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function backfillSubscriptionData() {
  console.log('🔄 Starting subscription data backfill...\n')

  // Get all premium users with stripe_customer_id
  const { data: premiumUsers, error } = await supabase
    .from('profiles')
    .select('id, email, stripe_customer_id, is_premium')
    .eq('is_premium', true)
    .not('stripe_customer_id', 'is', null)

  if (error) {
    console.error('❌ Error fetching premium users:', error)
    return
  }

  console.log(`Found ${premiumUsers.length} premium users to backfill\n`)

  let updated = 0
  let skipped = 0
  let errors = 0

  for (const user of premiumUsers) {
    try {
      console.log(`Processing: ${user.email}...`)

      // Get subscriptions from Stripe
      const subscriptions = await stripe.subscriptions.list({
        customer: user.stripe_customer_id,
        limit: 10,
      })

      // Find active or trialing subscription
      const activeSubscription = subscriptions.data.find(
        sub => sub.status === 'active' || sub.status === 'trialing'
      )

      if (!activeSubscription) {
        console.log(`  ⚠️  No active subscription found, skipping`)
        skipped++
        continue
      }

      const subscriptionAmount = activeSubscription.items.data[0]?.price?.unit_amount || 0
      const currency = activeSubscription.currency || 'usd'

      // Update database
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          stripe_subscription_id: activeSubscription.id,
          subscription_amount: subscriptionAmount / 100, // Convert cents to dollars
          subscription_status: activeSubscription.status,
          subscription_currency: currency,
        })
        .eq('id', user.id)

      if (updateError) {
        console.error(`  ❌ Failed to update:`, updateError)
        errors++
      } else {
        console.log(`  ✅ Updated: $${subscriptionAmount / 100}/month (${activeSubscription.status})`)
        updated++
      }
    } catch (err) {
      console.error(`  ❌ Error processing ${user.email}:`, err.message)
      errors++
    }
  }

  console.log('\n' + '='.repeat(80))
  console.log('📊 BACKFILL SUMMARY')
  console.log('='.repeat(80))
  console.log(`✅ Successfully updated: ${updated}`)
  console.log(`⚠️  Skipped (no active subscription): ${skipped}`)
  console.log(`❌ Errors: ${errors}`)
  console.log('')

  // Calculate MRR from backfilled data
  const { data: allPremium } = await supabase
    .from('profiles')
    .select('subscription_amount, is_admin')
    .eq('is_premium', true)

  const totalMRR = (allPremium || [])
    .filter(p => !p.is_admin)
    .reduce((sum, p) => sum + (Number(p.subscription_amount) || 0), 0)

  const promoUsers = (allPremium || [])
    .filter(p => !p.is_admin && Number(p.subscription_amount) === 0)
    .length

  const payingUsers = (allPremium || [])
    .filter(p => !p.is_admin && Number(p.subscription_amount) > 0)
    .length

  console.log('💰 CALCULATED MRR')
  console.log('='.repeat(80))
  console.log(`Total MRR: $${totalMRR.toFixed(2)}/month`)
  console.log(`Paying users: ${payingUsers}`)
  console.log(`Promo users: ${promoUsers}`)
  console.log('')
}

backfillSubscriptionData().catch(console.error)
