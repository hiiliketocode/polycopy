import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const USER_ID = '5478cb0a-c638-4b40-8afc-bf44eb9092db'
const WALLET = '0x53dbe8e629957930ea7235e2281066371553480e'

const UPDATES = [
  {
    name: 'Gavin Newsom',
    conditionId: '0x4567b275e6b667a6217f5cb4f06a797d3a1eaf1d0281fb5bc8c75e2046ae7e57',
    polymarketSize: 55.5555,
    polymarketAvgPrice: 0.1799,
  },
  {
    name: 'Marco Rubio',
    conditionId: '0x21ad31a46bfaa51650766eff6dc69c866959e32d965ffb116020e37694b6317d',
    polymarketSize: 67.5675,
    polymarketAvgPrice: 0.1479,
  },
  {
    name: 'Harvey Weinstein',
    conditionId: '0xe2b48e3b44de9658ee9c8b37354301763e33c0b502fd966839d644b4c0a9dea8',
    polymarketSize: 33.6486, // Total bought
    polymarketAvgPrice: 0.1479,
    currentSize: 17.4486, // Current position after partial sell
    realizedPnl: -0.0485,
  },
]

async function main() {
  console.log('🔧 Syncing positions from Polymarket...\n')

  for (const update of UPDATES) {
    console.log(`📝 ${update.name}`)

    // Update the original BUY order with correct size and avg price
    const { data: existing } = await supabase
      .from('orders')
      .select('*')
      .eq('copy_user_id', USER_ID)
      .eq('market_id', update.conditionId)
      .eq('side', 'buy')
      .single()

    if (!existing) {
      console.log(`   ❌ Original order not found`)
      continue
    }

    // Update the buy order
    const buyUpdate: any = {
      size: update.polymarketSize,
      filled_size: update.polymarketSize,
      price: update.polymarketAvgPrice,
    }

    // For Weinstein (partial sell), update remaining_size
    if (update.currentSize !== undefined) {
      buyUpdate.remaining_size = update.currentSize
    } else {
      buyUpdate.remaining_size = update.polymarketSize
    }

    const { error: updateError } = await supabase
      .from('orders')
      .update(buyUpdate)
      .eq('order_id', existing.order_id)

    if (updateError) {
      console.error(`   ❌ Error updating:`, updateError)
    } else {
      console.log(`   ✅ Updated BUY order: ${update.polymarketSize} @ ${update.polymarketAvgPrice}`)
      if (update.currentSize !== undefined) {
        console.log(`      Remaining size: ${update.currentSize}`)
      }
    }
  }

  console.log('\n✅ Done! Run clear-prod-cache.ts to see changes.')
}

main()
