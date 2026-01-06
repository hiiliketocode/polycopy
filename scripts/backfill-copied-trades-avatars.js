/**
 * Backfill script to populate trader_profile_image_url and market_avatar_url
 * for existing copied_trades records
 * 
 * Usage:
 *   node scripts/backfill-copied-trades-avatars.js
 */

// Load environment variables from .env.local
require('dotenv').config({ path: '.env.local' })

const { createClient } = require('@supabase/supabase-js')

// Create Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)

// Sleep function for rate limiting
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Fetch trader profile image from Polymarket leaderboard
 */
async function fetchTraderProfileImage(wallet) {
  try {
    const response = await fetch(
      `https://data-api.polymarket.com/v1/leaderboard?timePeriod=all&orderBy=VOL&limit=1&offset=0&category=overall&user=${wallet}`
    )
    
    if (!response.ok) {
      console.warn(`⚠️  Failed to fetch profile for ${wallet}: ${response.status}`)
      return null
    }
    
    const data = await response.json()
    if (Array.isArray(data) && data.length > 0 && data[0].profileImage) {
      return data[0].profileImage
    }
    
    return null
  } catch (err) {
    console.error(`❌ Error fetching profile for ${wallet}:`, err.message)
    return null
  }
}

/**
 * Extract market avatar from trade data using the same logic as the feed
 */
function extractMarketAvatarUrl(record) {
  if (!record) return null
  
  const avatarKeys = [
    'market_avatar',
    'market_avatar_url',
    'marketAvatar',
    'marketAvatarUrl',
    'icon',
    'market_icon',
    'marketIcon',
    'image',
    'image_url',
    'imageUrl',
  ]
  
  // Check direct properties
  for (const key of avatarKeys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) {
      return value
    }
  }
  
  // Check nested market object
  if (record.market) {
    for (const key of avatarKeys) {
      const value = record.market[key]
      if (typeof value === 'string' && value.trim()) {
        return value
      }
    }
  }
  
  return null
}

/**
 * Main backfill function
 */
async function backfillAvatars() {
  console.log('🚀 Starting backfill of trader profile images and market avatars...\n')
  
  try {
    // Fetch all copied trades that don't have profile images or market avatars
    const { data: trades, error: fetchError } = await supabase
      .from('copied_trades')
      .select('id, trader_wallet, trader_profile_image_url, market_id, market_slug, market_avatar_url')
      .or('trader_profile_image_url.is.null,market_avatar_url.is.null')
      .order('copied_at', { ascending: false })
    
    if (fetchError) {
      console.error('❌ Error fetching trades:', fetchError)
      return
    }
    
    if (!trades || trades.length === 0) {
      console.log('✅ No trades need backfilling!')
      return
    }
    
    console.log(`📊 Found ${trades.length} trades to backfill\n`)
    
    // Group trades by trader wallet to batch profile fetches
    const traderWallets = new Set()
    const tradesNeedingMarketAvatars = []
    
    for (const trade of trades) {
      if (!trade.trader_profile_image_url && trade.trader_wallet) {
        traderWallets.add(trade.trader_wallet)
      }
      if (!trade.market_avatar_url) {
        tradesNeedingMarketAvatars.push(trade)
      }
    }
    
    console.log(`👥 Found ${traderWallets.size} unique trader wallets to fetch`)
    console.log(`🎯 Found ${tradesNeedingMarketAvatars.length} trades needing market avatars\n`)
    
    // Fetch all trader profile images
    const traderProfileImages = new Map()
    let traderCount = 0
    
    for (const wallet of traderWallets) {
      traderCount++
      console.log(`🖼️  [${traderCount}/${traderWallets.size}] Fetching profile for ${wallet.slice(0, 8)}...`)
      
      const profileImage = await fetchTraderProfileImage(wallet)
      if (profileImage) {
        traderProfileImages.set(wallet, profileImage)
        console.log(`   ✅ Found profile image`)
      } else {
        console.log(`   ℹ️  No profile image found`)
      }
      
      // Rate limit: wait 200ms between requests
      await sleep(200)
    }
    
    console.log(`\n✅ Fetched ${traderProfileImages.size} trader profile images\n`)
    
    // Fetch market avatars by querying trader's recent trades
    // Group by trader wallet to minimize API calls
    const traderMarketAvatars = new Map() // Map<tradeId, avatarUrl>
    const traderWalletsForMarkets = new Set(tradesNeedingMarketAvatars.map(t => t.trader_wallet))
    let marketCount = 0
    
    console.log(`🎯 Fetching market avatars from ${traderWalletsForMarkets.size} traders' recent trades...\n`)
    
    for (const wallet of traderWalletsForMarkets) {
      marketCount++
      console.log(`🎯 [${marketCount}/${traderWalletsForMarkets.size}] Fetching trades for ${wallet.slice(0, 8)}...`)
      
      try {
        // Fetch recent trades for this trader
        const response = await fetch(
          `https://data-api.polymarket.com/trades?limit=50&user=${wallet}`
        )
        
        if (!response.ok) {
          console.log(`   ⚠️  API returned ${response.status}`)
          await sleep(200)
          continue
        }
        
        const traderTrades = await response.json()
        
        // Find market avatars for this trader's copied trades
        const tradesForThisWallet = tradesNeedingMarketAvatars.filter(t => t.trader_wallet === wallet)
        let foundCount = 0
        
        for (const copiedTrade of tradesForThisWallet) {
          // Try to find a matching trade in the trader's recent trades
          const matchingTrade = traderTrades.find(t => 
            t.conditionId === copiedTrade.market_id || 
            t.market_slug === copiedTrade.market_slug ||
            t.asset_id === copiedTrade.market_id
          )
          
          if (matchingTrade) {
            const avatar = extractMarketAvatarUrl(matchingTrade)
            if (avatar) {
              traderMarketAvatars.set(copiedTrade.id, avatar)
              foundCount++
            }
          }
        }
        
        console.log(`   ✅ Found ${foundCount} market avatars from this trader's trades`)
      } catch (err) {
        console.log(`   ❌ Error: ${err.message}`)
      }
      
      // Rate limit: wait 200ms between requests
      await sleep(200)
    }
    
    console.log(`\n✅ Fetched ${traderMarketAvatars.size} market avatars\n`)
    
    // Update all trades with the fetched data
    console.log('💾 Updating trades in database...\n')
    
    let updatedCount = 0
    let errorCount = 0
    
    for (const trade of trades) {
      const updates = {}
      
      // Add trader profile image if we fetched one and it's missing
      if (!trade.trader_profile_image_url && trade.trader_wallet) {
        const profileImage = traderProfileImages.get(trade.trader_wallet)
        if (profileImage) {
          updates.trader_profile_image_url = profileImage
        }
      }
      
      // Add market avatar if we fetched one and it's missing
      if (!trade.market_avatar_url) {
        const avatar = traderMarketAvatars.get(trade.id)
        if (avatar) {
          updates.market_avatar_url = avatar
        }
      }
      
      // Only update if we have something to update
      if (Object.keys(updates).length > 0) {
        const { error: updateError } = await supabase
          .from('copied_trades')
          .update(updates)
          .eq('id', trade.id)
        
        if (updateError) {
          console.error(`❌ Error updating trade ${trade.id}:`, updateError.message)
          errorCount++
        } else {
          updatedCount++
          if (updatedCount % 10 === 0) {
            console.log(`   ✅ Updated ${updatedCount} trades so far...`)
          }
        }
      }
    }
    
    console.log('\n' + '='.repeat(60))
    console.log('🎉 Backfill complete!')
    console.log('='.repeat(60))
    console.log(`✅ Successfully updated: ${updatedCount} trades`)
    console.log(`❌ Errors: ${errorCount} trades`)
    console.log(`📊 Trader profile images found: ${traderProfileImages.size}`)
    console.log(`🎯 Market avatars found: ${traderMarketAvatars.size}`)
    console.log('='.repeat(60))
    
  } catch (err) {
    console.error('\n❌ Fatal error during backfill:', err)
    process.exit(1)
  }
}

// Run the backfill
backfillAvatars()
  .then(() => {
    console.log('\n✅ Backfill script completed successfully')
    process.exit(0)
  })
  .catch((err) => {
    console.error('\n❌ Backfill script failed:', err)
    process.exit(1)
  })

