/* eslint-disable no-console */
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'
import * as fs from 'fs'

// Load environment variables
const envPath = path.join(process.cwd(), '.env.local')
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath })
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing Supabase env vars')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

const marketIds = [
  '0x106ece51e91f5f70af546ae1e709',
  '0x0db284ea688e57a2749b7a615082',
  '0xf07d84afcd47f278492743412b9f'
]

async function checkMarkets() {
  console.log('Checking resolved markets...\n')
  
  for (const marketId of marketIds) {
    console.log(`Market: ${marketId}`)
    
    // Try exact match first
    let { data: market, error } = await supabase
      .from('markets')
      .select('*')
      .eq('condition_id', marketId)
      .maybeSingle()
    
    // If not found, try prefix match
    if (!market && !error) {
      const { data: markets } = await supabase
        .from('markets')
        .select('*')
        .like('condition_id', `${marketId}%`)
        .limit(5)
      
      if (markets && markets.length > 0) {
        console.log(`Found ${markets.length} markets with prefix match:`)
        markets.forEach((m, i) => {
          console.log(`  ${i + 1}. condition_id: ${m.condition_id}`)
          console.log(`     closed: ${m.closed}`)
          console.log(`     winning_side: ${m.winning_side || 'NULL'}`)
          console.log(`     resolved_outcome: ${m.resolved_outcome || 'NULL'}`)
          console.log(`     outcome_prices: ${JSON.stringify(m.outcome_prices)}`)
          console.log(``)
        })
      } else {
        console.log(`  No market found with condition_id starting with ${marketId}`)
      }
    } else if (market) {
      console.log(`  condition_id: ${market.condition_id}`)
      console.log(`  closed: ${market.closed}`)
      console.log(`  winning_side: ${market.winning_side || 'NULL'}`)
      console.log(`  resolved_outcome: ${market.resolved_outcome || 'NULL'}`)
      console.log(`  outcome_prices: ${JSON.stringify(market.outcome_prices)}`)
      console.log(``)
    } else if (error) {
      console.log(`  Error: ${error.message}`)
      console.log(``)
    }
  }
}

checkMarkets()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error)
    process.exit(1)
  })
