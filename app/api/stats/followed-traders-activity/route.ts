import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Cache the result for 10 minutes
let cachedResult: { count: number; timestamp: number } | null = null
const CACHE_DURATION = 10 * 60 * 1000 // 10 minutes in milliseconds

/**
 * Fetch trade count for a single trader in the last 24 hours
 * Uses the same Polymarket Data API that the feed uses (no auth required)
 */
async function getTraderTradeCount(wallet: string, twentyFourHoursAgo: number): Promise<number> {
  try {
    // Use the same endpoint as the feed: https://data-api.polymarket.com/trades
    // This endpoint doesn't require authentication
    const response = await fetch(
      `https://data-api.polymarket.com/trades?user=${wallet}&limit=100`,
      { 
        cache: 'no-store',
        signal: AbortSignal.timeout(5000)
      }
    )

    if (!response.ok) {
      return 0
    }

    const trades = await response.json()
    
    if (!Array.isArray(trades)) {
      return 0
    }

    // Count only trades from the last 24 hours
    const recentTrades = trades.filter((trade: any) => {
      const tradeTimestamp = trade.timestamp || trade.created_at || 0
      // Convert to milliseconds if needed
      const timestampMs = tradeTimestamp < 10_000_000_000 ? tradeTimestamp * 1000 : tradeTimestamp
      return timestampMs >= twentyFourHoursAgo
    })

    return recentTrades.length
  } catch (err) {
    console.error(`Error fetching trades for ${wallet}:`, err)
    return 0
  }
}

export async function GET() {
  try {
    // Check if we have a valid cached result
    if (cachedResult && Date.now() - cachedResult.timestamp < CACHE_DURATION) {
      return NextResponse.json({ 
        tradeCount: cachedResult.count,
        cached: true,
        cacheAge: Math.floor((Date.now() - cachedResult.timestamp) / 1000)
      })
    }

    // Create server-side Supabase client with service role key
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("Missing Supabase environment variables")
      return NextResponse.json({ 
        error: "Configuration error",
        tradeCount: 0 
      }, { status: 500 })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    // Get all trader wallets that have at least one follower
    const { data: followedTraders, error: followsError } = await supabase
      .from("follows")
      .select("trader_wallet")
      .not("trader_wallet", "is", null)

    if (followsError) {
      console.error("Error fetching followed traders:", followsError)
      return NextResponse.json({ 
        error: "Failed to fetch followed traders",
        details: followsError.message,
        tradeCount: 0
      }, { status: 500 })
    }

    // Get unique trader wallets
    const uniqueWallets = [...new Set(followedTraders.map(f => f.trader_wallet))]
    
    if (uniqueWallets.length === 0) {
      // No followed traders yet
      cachedResult = { count: 0, timestamp: Date.now() }
      return NextResponse.json({ tradeCount: 0, cached: false, tradersChecked: 0 })
    }

    // Calculate timestamp for 24 hours ago in milliseconds
    const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000)

    console.log(`Counting trades for ${uniqueWallets.length} followed traders since ${new Date(twentyFourHoursAgo).toISOString()}...`)

    // Fetch trade counts from Polymarket Data API for each trader
    // Process in batches to avoid overwhelming the API
    let totalTrades = 0
    const batchSize = 10
    
    for (let i = 0; i < uniqueWallets.length; i += batchSize) {
      const batch = uniqueWallets.slice(i, i + batchSize)
      
      // Fetch trades for this batch in parallel
      const batchPromises = batch.map(wallet => 
        getTraderTradeCount(wallet, twentyFourHoursAgo)
      )

      const batchResults = await Promise.all(batchPromises)
      const batchTotal = batchResults.reduce((sum, count) => sum + count, 0)
      totalTrades += batchTotal

      console.log(`Batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(uniqueWallets.length / batchSize)}: ${batchTotal} trades`)

      // Small delay between batches to be respectful to the API
      if (i + batchSize < uniqueWallets.length) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }

    console.log(`Total trades by followed traders in last 24h: ${totalTrades}`)

    // Cache the result
    cachedResult = { count: totalTrades, timestamp: Date.now() }

    return NextResponse.json({ 
      tradeCount: totalTrades,
      cached: false,
      tradersChecked: uniqueWallets.length
    })

  } catch (error) {
    console.error("Error in followed-traders-activity:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
