import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const USER_ID = '5478cb0a-c638-4b40-8afc-bf44eb9092db'

const FIXES = [
  {
    name: 'Gavin Newsom',
    conditionId: '0x4567b275e6b667a6217f5cb4f06a797d3a1eaf1d0281fb5bc8c75e2046ae7e57',
    updates: {
      status: 'filled', // Change from 'manual' to 'filled'
      market_resolved: false,
    },
  },
  {
    name: 'Marco Rubio',
    conditionId: '0x21ad31a46bfaa51650766eff6dc69c866959e32d965ffb116020e37694b6317d',
    updates: {
      status: 'filled', // Change from 'manual' to 'filled'
      market_resolved: false,
    },
  },
  {
    name: 'Harvey Weinstein',
    conditionId: '0xe2b48e3b44de9658ee9c8b37354301763e33c0b502fd966839d644b4c0a9dea8',
    updates: {
      market_resolved: false, // Change from TRUE to FALSE
    },
  },
]

async function main() {
  console.log('🔧 Fixing missing positions...\n')

  for (const fix of FIXES) {
    console.log(`📝 ${fix.name}`)
    console.log(`   Condition ID: ${fix.conditionId}`)
    console.log(`   Updates: ${JSON.stringify(fix.updates)}`)

    const { data, error } = await supabase
      .from('orders')
      .update(fix.updates)
      .eq('copy_user_id', USER_ID)
      .eq('market_id', fix.conditionId)
      .select()

    if (error) {
      console.error(`   ❌ Error:`, error)
    } else {
      console.log(`   ✅ Updated ${data?.length || 0} order(s)`)
    }
  }

  console.log('\n✅ Done! Run clear-prod-cache.ts to see changes on live site.')
}

main()
