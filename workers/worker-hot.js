#!/usr/bin/env node
'use strict'

/**
 * Hot worker: Polls actively followed traders every 1-3 seconds
 * Always-on process running on Fly.io
 */

const { RateLimiter, WalletCooldown, processWallet, supabase } = require('./shared/polling')

const HOT_POLL_INTERVAL_MS = 2000 // 2 seconds between full cycles
const HOT_COOLDOWN_MS = 1000 // 1 second per wallet

async function getHotWallets() {
  // Hot wallets are those in the 'follows' table (derived dynamically)
  // No need to store tier in wallet_poll_state - it's derived from follows table
  const { data: follows, error } = await supabase
    .from('follows')
    .select('trader_wallet')
    .eq('active', true)

  if (error) throw error

  const wallets = [...new Set((follows || []).map(f => f.trader_wallet.toLowerCase()).filter(Boolean))]
  return wallets
}

async function getTraderId(wallet) {
  const { data } = await supabase
    .from('traders')
    .select('id')
    .eq('wallet_address', wallet.toLowerCase())
    .maybeSingle()

  return data?.id || null
}

function isTimeoutError(err) {
  const msg = (err.message || err.toString() || '').toLowerCase()
  return msg.includes('statement timeout') || 
         msg.includes('canceling statement') ||
         msg.includes('timeout') ||
         msg.includes('query timeout') ||
         msg.includes('upstream request timeout')
}

async function main() {
  console.log('🔥 Hot worker starting...')
  console.log(`Supabase URL: ${process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL}`)

  const rateLimiter = new RateLimiter({ requestsPerSecond: 10, burst: 20 })
  const walletCooldown = new WalletCooldown(HOT_COOLDOWN_MS)

  let cycleCount = 0
  let errorCount = 0
  const maxErrors = 50 // Increased threshold - timeouts are common and non-fatal

  while (true) {
    try {
      cycleCount++
      errorCount = 0 // Reset error count at start of each cycle
      const cycleStart = Date.now()

      const wallets = await getHotWallets()
      console.log(`[Cycle ${cycleCount}] Processing ${wallets.length} hot wallets...`)

      if (wallets.length === 0) {
        console.log('No hot wallets found, sleeping...')
        await new Promise(resolve => setTimeout(resolve, HOT_POLL_INTERVAL_MS))
        continue
      }

      // Process wallets sequentially with rate limiting
      for (const wallet of wallets) {
        try {
          const traderId = await getTraderId(wallet)
          await processWallet(wallet, traderId, 'hot', rateLimiter, walletCooldown)
        } catch (err) {
          const isTimeout = isTimeoutError(err)
          if (isTimeout) {
            // Timeouts are non-fatal - just log and continue
            console.error(`⏱️  Timeout processing wallet ${wallet}:`, err.message || err)
          } else {
            // Other errors count toward the limit
            console.error(`Error processing wallet ${wallet}:`, err.message || err)
            errorCount++
          }
          
          // Only exit on non-timeout errors exceeding threshold
          if (!isTimeout && errorCount >= maxErrors) {
            console.error(`Too many non-timeout errors (${errorCount}), exiting...`)
            process.exit(1)
          }
        }
      }

      const cycleDuration = Date.now() - cycleStart
      const sleepTime = Math.max(0, HOT_POLL_INTERVAL_MS - cycleDuration)

      if (sleepTime > 0) {
        await new Promise(resolve => setTimeout(resolve, sleepTime))
      }
    } catch (err) {
      const isTimeout = isTimeoutError(err)
      if (isTimeout) {
        console.error('⏱️  Timeout in cycle:', err.message || err)
        // Don't count timeouts as fatal errors
      } else {
        console.error('Fatal error in hot worker:', err)
        errorCount++
        if (errorCount >= maxErrors) {
          console.error('Too many fatal errors, exiting...')
          process.exit(1)
        }
      }
      await new Promise(resolve => setTimeout(resolve, 5000))
    }
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...')
  process.exit(0)
})

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...')
  process.exit(0)
})

main().catch(err => {
  console.error('Hot worker crashed:', err)
  process.exit(1)
})


