#!/usr/bin/env node
/**
 * Count paying customers (users who have submitted payment details and been charged)
 * A paying customer has:
 * - is_premium = true
 * - stripe_customer_id (has payment method on file)
 * - premium_since (has been charged at least once)
 */

require('dotenv').config({ path: '.env.local' })

const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function countPayingCustomers() {
  try {
    console.log('📊 Fetching paying customer data...\n')

    // Get all premium users with payment details
    const { data: premiumUsers, error } = await supabase
      .from('profiles')
      .select('id, email, is_premium, premium_since, stripe_customer_id, created_at')
      .eq('is_premium', true)
      .not('stripe_customer_id', 'is', null)
      .not('premium_since', 'is', null)
      .order('premium_since', { ascending: false })

    if (error) {
      throw error
    }

    // Calculate stats
    const total = premiumUsers.length
    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    const last30Days = premiumUsers.filter(u => new Date(u.premium_since) >= thirtyDaysAgo).length
    const last7Days = premiumUsers.filter(u => new Date(u.premium_since) >= sevenDaysAgo).length

    // Print summary
    console.log('=' .repeat(60))
    console.log('💰 PAYING CUSTOMERS SUMMARY')
    console.log('=' .repeat(60))
    console.log(`Total Paying Customers:     ${total}`)
    console.log(`New in Last 30 Days:        ${last30Days}`)
    console.log(`New in Last 7 Days:         ${last7Days}`)
    console.log('=' .repeat(60))
    console.log('')

    // Group by month
    const byMonth = {}
    premiumUsers.forEach(user => {
      const month = new Date(user.premium_since).toISOString().slice(0, 7) // YYYY-MM
      byMonth[month] = (byMonth[month] || 0) + 1
    })

    console.log('📅 CUSTOMERS BY SIGNUP MONTH:')
    console.log('-' .repeat(60))
    Object.keys(byMonth)
      .sort()
      .reverse()
      .forEach(month => {
        const count = byMonth[month]
        const bar = '█'.repeat(Math.min(count, 50))
        console.log(`${month}:  ${count.toString().padStart(3)} ${bar}`)
      })
    console.log('')

    // Show recent customers
    console.log('🆕 MOST RECENT PAYING CUSTOMERS:')
    console.log('-' .repeat(60))
    premiumUsers.slice(0, 10).forEach((user, i) => {
      const premiumDate = new Date(user.premium_since).toLocaleDateString()
      const email = user.email || 'No email'
      console.log(`${(i + 1).toString().padStart(2)}. ${email.padEnd(30)} - ${premiumDate}`)
    })
    console.log('')

    // Also check for users who have stripe_customer_id but aren't premium (cancelled)
    const { data: cancelledUsers, error: cancelledError } = await supabase
      .from('profiles')
      .select('id, stripe_customer_id, is_premium')
      .eq('is_premium', false)
      .not('stripe_customer_id', 'is', null)

    if (!cancelledError && cancelledUsers.length > 0) {
      console.log('⚠️  USERS WITH PAYMENT METHOD BUT NO ACTIVE SUBSCRIPTION:')
      console.log('-' .repeat(60))
      console.log(`Count: ${cancelledUsers.length} (likely cancelled subscriptions)`)
      console.log('')
    }

    console.log('✅ Done!')

  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  }
}

countPayingCustomers()
