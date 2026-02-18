#!/usr/bin/env node
'use strict'

/**
 * @deprecated — Replaced by polymarket-trade-stream worker which writes to trades_public
 * via WebSocket in real-time. This polling-based worker should be stopped on Fly.io once
 * trade-stream is confirmed writing to trades_public.
 *
 * Cold worker: Polls all other traders hourly with job locking
 * Always-on process running on Fly.io
 */

const { RateLimiter, WalletCooldown, processWallet, supabase } = require('./shared/polling')

const COLD_POLL_INTERVAL_MS = 60 * 60 * 1000 // 1 hour
const COLD_COOLDOWN_MS = 5000 // 5 seconds per wallet
const JOB_LOCK_DURATION_MS = 65 * 60 * 1000 // 65 minutes (slightly longer than interval)
const JOB_NAME = 'cold_poll'

async function acquireLock() {
  const now = new Date()
  const lockedUntil = new Date(now.getTime() + JOB_LOCK_DURATION_MS)

  // Try to acquire lock: update if locked_until < now, otherwise fail
  const { data, error } = await supabase.rpc('acquire_job_lock', {
    p_job_name: JOB_NAME,
    p_locked_until: lockedUntil.toISOString()
  })

  if (error) {
    // If function doesn't exist, create it on the fly (should be in migration)
    if (error.code === '42883') {
      console.warn('acquire_job_lock function not found, lock check skipped')
      return true // Proceed without locking (not ideal but allows testing)
    }
    throw error
  }

  return data === true
}

async function extendLock() {
  const now = new Date()
  const lockedUntil = new Date(now.getTime() + JOB_LOCK_DURATION_MS)

  const { error } = await supabase
    .from('job_locks')
    .update({ locked_until: lockedUntil.toISOString() })
    .eq('job_name', JOB_NAME)

  if (error) throw error
}

async function releaseLock() {
  const { error } = await supabase
    .from('job_locks')
    .delete()
    .eq('job_name', JOB_NAME)

  if (error) throw error
}

async function getColdWallets() {
  // Hot wallets are those in the 'follows' table (derived dynamically)
  // Get all traders that are followed (hot list)
  const { data: follows } = await supabase
    .from('follows')
    .select('trader_wallet')
    .eq('active', true)

  const hotWallets = new Set((follows || []).map(f => f.trader_wallet.toLowerCase()).filter(Boolean))

  // Get all traders from traders table
  const { data: traders, error } = await supabase
    .from('traders')
    .select('wallet_address')
    .eq('is_active', true)

  if (error) throw error

  // Filter out hot wallets
  const coldWallets = (traders || [])
    .map(t => t.wallet_address?.toLowerCase())
    .filter(Boolean)
    .filter(w => !hotWallets.has(w))

  return [...new Set(coldWallets)]
}

async function getTraderId(wallet) {
  const { data } = await supabase
    .from('traders')
    .select('id')
    .eq('wallet_address', wallet.toLowerCase())
    .maybeSingle()

  return data?.id || null
}

async function main() {
  console.log('❄️  Cold worker starting...')
  console.log(`Supabase URL: ${process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL}`)

  const rateLimiter = new RateLimiter({ requestsPerSecond: 5, burst: 10 })
  const walletCooldown = new WalletCooldown(COLD_COOLDOWN_MS)

  let cycleCount = 0

  while (true) {
    let lockHeld = false
    try {
      // Try to acquire lock
      const acquired = await acquireLock()
      if (!acquired) {
        console.log(`[Cycle ${cycleCount}] Lock held by another instance, skipping...`)
        await new Promise(resolve => setTimeout(resolve, COLD_POLL_INTERVAL_MS))
        continue
      }

      lockHeld = true
      cycleCount++
      const cycleStart = Date.now()

      console.log(`[Cycle ${cycleCount}] Acquired lock, processing cold wallets...`)

      // Extend lock periodically during processing
      const lockExtendInterval = setInterval(() => {
        extendLock().catch(err => console.error('Failed to extend lock:', err))
      }, 30 * 60 * 1000) // Every 30 minutes

      try {
        const wallets = await getColdWallets()
        console.log(`[Cycle ${cycleCount}] Processing ${wallets.length} cold wallets...`)

        if (wallets.length === 0) {
          console.log('No cold wallets found')
        } else {
          // Process wallets sequentially with rate limiting
          for (let i = 0; i < wallets.length; i++) {
            const wallet = wallets[i]
            try {
              const traderId = await getTraderId(wallet)
              await processWallet(wallet, traderId, 'cold', rateLimiter, walletCooldown)

              // Extend lock every 100 wallets
              if ((i + 1) % 100 === 0) {
                await extendLock()
                console.log(`[Cycle ${cycleCount}] Processed ${i + 1}/${wallets.length} wallets, lock extended`)
              }
            } catch (err) {
              console.error(`Error processing wallet ${wallet}:`, err.message || err)
              // Continue with next wallet
            }
          }
        }

        clearInterval(lockExtendInterval)
        await releaseLock()
        lockHeld = false

        const cycleDuration = Date.now() - cycleStart
        console.log(`[Cycle ${cycleCount}] Completed in ${Math.round(cycleDuration / 1000)}s`)

        // Sleep until next interval (with jitter)
        const jitter = Math.random() * 60000 // 0-60 seconds
        const sleepTime = COLD_POLL_INTERVAL_MS + jitter
        await new Promise(resolve => setTimeout(resolve, sleepTime))
      } catch (err) {
        clearInterval(lockExtendInterval)
        throw err
      }
    } catch (err) {
      console.error('Error in cold worker cycle:', err)
      if (lockHeld) {
        try {
          await releaseLock()
        } catch (releaseErr) {
          console.error('Failed to release lock:', releaseErr)
        }
      }
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, 60000))
    }
  }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, releasing lock and shutting down...')
  try {
    await releaseLock()
  } catch (err) {
    console.error('Error releasing lock:', err)
  }
  process.exit(0)
})

process.on('SIGINT', async () => {
  console.log('SIGINT received, releasing lock and shutting down...')
  try {
    await releaseLock()
  } catch (err) {
    console.error('Error releasing lock:', err)
  }
  process.exit(0)
})

main().catch(err => {
  console.error('Cold worker crashed:', err)
  process.exit(1)
})


