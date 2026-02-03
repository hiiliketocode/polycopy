/**
 * Audit Premium Users - Check if users marked as premium actually have active Stripe subscriptions
 * 
 * This script:
 * 1. Finds all users with is_premium=true in the database
 * 2. Checks their Stripe subscription status
 * 3. Reports users who should be downgraded (no active subscription)
 * 4. Optionally fixes the database (with --fix flag)
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

async function auditPremiumUsers(fix = false) {
  console.log('🔍 Auditing premium users...\n')

  // Get all users marked as premium
  const { data: premiumUsers, error } = await supabase
    .from('profiles')
    .select('id, email, is_premium, stripe_customer_id, premium_since')
    .eq('is_premium', true)
    .order('premium_since', { ascending: false })

  if (error) {
    console.error('❌ Error fetching premium users:', error)
    return
  }

  console.log(`Found ${premiumUsers.length} users marked as premium\n`)

  const fraudulent = []
  const valid = []
  const errors = []

  for (const user of premiumUsers) {
    // Users with no stripe_customer_id are definitely fraudulent
    if (!user.stripe_customer_id) {
      console.log(`❌ FRAUDULENT: ${user.email} (no Stripe customer ID)`)
      fraudulent.push({
        ...user,
        reason: 'No Stripe customer ID'
      })
      continue
    }

    try {
      // Check if customer has active subscriptions
      const subscriptions = await stripe.subscriptions.list({
        customer: user.stripe_customer_id,
        limit: 10,
      })

      const activeSubscriptions = subscriptions.data.filter(
        sub => sub.status === 'active' || sub.status === 'trialing'
      )

      if (activeSubscriptions.length === 0) {
        console.log(`❌ FRAUDULENT: ${user.email} (no active subscription in Stripe)`)
        console.log(`   Customer ID: ${user.stripe_customer_id}`)
        console.log(`   All subscriptions: ${subscriptions.data.map(s => s.status).join(', ') || 'none'}`)
        fraudulent.push({
          ...user,
          reason: 'No active Stripe subscription',
          stripeStatus: subscriptions.data.map(s => s.status).join(', ') || 'none'
        })
      } else {
        console.log(`✅ VALID: ${user.email} (${activeSubscriptions.length} active subscription(s))`)
        valid.push(user)
      }
    } catch (err) {
      console.error(`⚠️  ERROR checking ${user.email}:`, err.message)
      errors.push({
        ...user,
        error: err.message
      })
    }
  }

  // Summary
  console.log('\n' + '='.repeat(80))
  console.log('📊 AUDIT SUMMARY')
  console.log('='.repeat(80))
  console.log(`✅ Valid premium users: ${valid.length}`)
  console.log(`❌ Fraudulent premium users: ${fraudulent.length}`)
  console.log(`⚠️  Errors: ${errors.length}`)
  console.log('')

  if (fraudulent.length > 0) {
    console.log('\n🚨 FRAUDULENT USERS TO DOWNGRADE:')
    console.log('=' .repeat(80))
    fraudulent.forEach(user => {
      console.log(`- ${user.email}`)
      console.log(`  ID: ${user.id}`)
      console.log(`  Reason: ${user.reason}`)
      if (user.stripeStatus) {
        console.log(`  Stripe Status: ${user.stripeStatus}`)
      }
      console.log('')
    })
  }

  // Fix database if requested
  if (fix && fraudulent.length > 0) {
    console.log('\n🔧 FIXING DATABASE...')
    console.log('=' .repeat(80))
    
    for (const user of fraudulent) {
      try {
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ is_premium: false })
          .eq('id', user.id)

        if (updateError) {
          console.error(`❌ Failed to downgrade ${user.email}:`, updateError)
        } else {
          console.log(`✅ Downgraded ${user.email}`)
        }
      } catch (err) {
        console.error(`❌ Error downgrading ${user.email}:`, err)
      }
    }

    console.log('\n✅ Database cleanup complete!')
  } else if (fraudulent.length > 0) {
    console.log('\n💡 To automatically fix these issues, run:')
    console.log('   node scripts/audit-premium-users.js --fix')
  }

  // Calculate impact
  const fraudulentMRR = fraudulent.length * 20
  console.log(`\n💰 REVENUE IMPACT: -$${fraudulentMRR}/month (${fraudulent.length} × $20)`)
}

// Parse command line arguments
const args = process.argv.slice(2)
const shouldFix = args.includes('--fix')

if (shouldFix) {
  console.log('⚠️  Running in FIX mode - will update database\n')
} else {
  console.log('ℹ️  Running in AUDIT mode - no changes will be made\n')
}

auditPremiumUsers(shouldFix).catch(console.error)
