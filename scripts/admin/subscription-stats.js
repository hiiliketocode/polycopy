#!/usr/bin/env node
/**
 * Show subscription and cancellation statistics
 * Only counts users who have COMPLETED payment (premium_since is set)
 * 
 * Breakdown:
 * - Total who have ever completed a payment
 * - Currently active subscribers (completed payment + still premium)
 * - Cancelled subscriptions (completed payment but no longer premium)
 * - Abandoned checkouts (started but never completed payment)
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

async function getSubscriptionStats() {
  try {
    console.log('📊 Analyzing subscription data...\n')

    // Get ACTIVE premium users (currently subscribed AND have completed payment)
    const { data: activeSubscribers, error: activeError } = await supabase
      .from('profiles')
      .select('id, email, premium_since, stripe_customer_id')
      .eq('is_premium', true)
      .not('premium_since', 'is', null)

    if (activeError) throw activeError

    // Get CANCELLED subscriptions (have premium_since but not currently premium)
    // These are people who completed payment but then cancelled
    const { data: cancelledSubscribers, error: cancelledError } = await supabase
      .from('profiles')
      .select('id, email, premium_since, stripe_customer_id')
      .eq('is_premium', false)
      .not('premium_since', 'is', null)

    if (cancelledError) throw cancelledError

    // Get ABANDONED checkouts (have stripe_customer_id but NO premium_since)
    // These started checkout but never completed payment
    const { data: abandonedCheckouts, error: abandonedError } = await supabase
      .from('profiles')
      .select('id, email, stripe_customer_id')
      .not('stripe_customer_id', 'is', null)
      .is('premium_since', null)

    if (abandonedError) throw abandonedError

    // Calculate totals
    const activeCount = activeSubscribers.length
    const cancelledCount = cancelledSubscribers.length
    const abandonedCount = abandonedCheckouts.length
    const totalEverPaid = activeCount + cancelledCount
    const retentionRate = totalEverPaid > 0 
      ? ((activeCount / totalEverPaid) * 100).toFixed(1)
      : 0

    // Print summary
    console.log('=' .repeat(70))
    console.log('📈 SUBSCRIPTION LIFECYCLE SUMMARY (PAID CUSTOMERS ONLY)')
    console.log('=' .repeat(70))
    console.log('')
    console.log(`Total Ever Completed Payment:   ${totalEverPaid}`)
    console.log(`  ├─ Currently Active:          ${activeCount} ✅`)
    console.log(`  └─ Cancelled After Payment:   ${cancelledCount} ❌`)
    console.log('')
    console.log(`Abandoned Checkouts:            ${abandonedCount} 🚫 (started but never paid)`)
    console.log('')
    console.log(`Retention Rate:                 ${retentionRate}% (of paid customers)`)
    console.log(`Churn Rate:                     ${(100 - retentionRate).toFixed(1)}% (of paid customers)`)
    console.log('=' .repeat(70))
    console.log('')

    // Show active subscribers by month
    const activeByMonth = {}
    activeSubscribers.forEach(user => {
      if (user.premium_since) {
        const month = new Date(user.premium_since).toISOString().slice(0, 7)
        activeByMonth[month] = (activeByMonth[month] || 0) + 1
      }
    })

    console.log('✅ ACTIVE SUBSCRIBERS BY SIGNUP MONTH:')
    console.log('-' .repeat(70))
    Object.keys(activeByMonth)
      .sort()
      .reverse()
      .forEach(month => {
        const count = activeByMonth[month]
        const bar = '█'.repeat(Math.min(count, 50))
        console.log(`${month}:  ${count.toString().padStart(3)} ${bar}`)
      })
    console.log('')

    // Show most recent active subscribers
    const recentActive = activeSubscribers
      .filter(u => u.premium_since)
      .sort((a, b) => new Date(b.premium_since) - new Date(a.premium_since))
      .slice(0, 5)

    console.log('🆕 MOST RECENT ACTIVE SUBSCRIBERS (Completed Payment):')
    console.log('-' .repeat(70))
    recentActive.forEach((user, i) => {
      const date = new Date(user.premium_since).toLocaleDateString()
      console.log(`${(i + 1).toString().padStart(2)}. ${(user.email || 'No email').padEnd(35)} - ${date}`)
    })
    console.log('')

    // Show cancelled subscribers who DID complete payment
    if (cancelledCount > 0) {
      console.log('❌ CANCELLED SUBSCRIPTIONS (Completed Payment Then Cancelled):')
      console.log('-' .repeat(70))
      console.log(`Total Cancelled: ${cancelledCount}`)
      console.log('')
      const recentCancelled = cancelledSubscribers
        .sort((a, b) => new Date(b.premium_since) - new Date(a.premium_since))
        .slice(0, 5)
      console.log('Most recent:')
      recentCancelled.forEach((user, i) => {
        const signupDate = new Date(user.premium_since).toLocaleDateString()
        console.log(`${(i + 1).toString().padStart(2)}. ${(user.email || 'No email').padEnd(35)} (paid on ${signupDate})`)
      })
      console.log('')
    }

    // Show abandoned checkouts
    if (abandonedCount > 0) {
      console.log('🚫 ABANDONED CHECKOUTS (Started But Never Completed Payment):')
      console.log('-' .repeat(70))
      console.log(`Total Abandoned: ${abandonedCount}`)
      console.log('')
      console.log('Examples:')
      abandonedCheckouts.slice(0, 5).forEach((user, i) => {
        console.log(`${(i + 1).toString().padStart(2)}. ${(user.email || 'No email').padEnd(35)}`)
      })
      console.log('')
    }

    // Summary insights
    console.log('💡 KEY INSIGHTS:')
    console.log('-' .repeat(70))
    console.log(`• ${activeCount} customers are currently paying for premium`)
    console.log(`• ${cancelledCount} customers completed payment but later cancelled`)
    console.log(`• ${totalEverPaid} total customers have ever completed a payment`)
    console.log(`• ${abandonedCount} users started checkout but never completed payment`)
    console.log(`• You're retaining ${retentionRate}% of all customers who have paid`)
    
    if (cancelledCount > 0) {
      const churnPercentage = ((cancelledCount / totalEverPaid) * 100).toFixed(1)
      console.log(`• ${churnPercentage}% of paid customers have cancelled`)
    }

    if (abandonedCount > 0 && totalEverPaid > 0) {
      const abandonRate = ((abandonedCount / (abandonedCount + totalEverPaid)) * 100).toFixed(1)
      console.log(`• ${abandonRate}% checkout abandonment rate`)
    }
    
    console.log('')
    console.log('✅ Done!')

  } catch (error) {
    console.error('❌ Error:', error.message)
    console.error(error)
    process.exit(1)
  }
}

getSubscriptionStats()
