import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthedClobClientForUserAnyWallet } from '@/lib/polymarket/authed-client'
import { AssetType } from '@polymarket/clob-client'
import { USDC_DECIMALS } from '@/lib/turnkey/config'

const DEV_BYPASS_AUTH =
  process.env.TURNKEY_DEV_ALLOW_UNAUTH === 'true' &&
  Boolean(process.env.TURNKEY_DEV_BYPASS_USER_ID)

function formatUsdcFromRaw(raw: string | null) {
  if (!raw) return null
  let value: bigint
  try {
    value = BigInt(raw)
  } catch {
    return null
  }

  const base = 10n ** BigInt(USDC_DECIMALS)
  const scale = 100n
  const scaled = (value * scale) / base
  const units = scaled / scale
  const cents = scaled % scale
  const unitsLabel = units.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const centsLabel = cents.toString().padStart(2, '0')
  return `${unitsLabel}.${centsLabel} USDC`
}

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  let userId: string | null = user?.id ?? null
  if (!userId && DEV_BYPASS_AUTH && process.env.TURNKEY_DEV_BYPASS_USER_ID) {
    userId = process.env.TURNKEY_DEV_BYPASS_USER_ID
  }

  if (!userId) {
    return NextResponse.json(
      { error: 'Unauthorized - please log in', details: authError?.message },
      { status: 401 }
    )
  }

  try {
    const { client, proxyAddress } = await getAuthedClobClientForUserAnyWallet(userId)
    const balanceData = await client.getBalanceAllowance({
      asset_type: AssetType.COLLATERAL,
    })

    return NextResponse.json({
      proxyAddress,
      balance: balanceData?.balance ?? null,
      allowance: balanceData?.allowance ?? null,
      balanceFormatted: formatUsdcFromRaw(balanceData?.balance ?? null),
      allowanceFormatted: formatUsdcFromRaw(balanceData?.allowance ?? null),
    })
  } catch (error: any) {
    console.error('[POLY-BALANCE] Error:', error?.message || error)
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch balance' },
      { status: 500 }
    )
  }
}
