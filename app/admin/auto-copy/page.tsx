import AutoCopyAdminConsole from './AutoCopyAdminConsole'
import { createAdminServiceClient, getAdminSessionUser } from '@/lib/admin'
import { TraderSummary, AutoCopyConfig } from './types'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const MAX_TRADER_HISTORY = 400

function normalizeWalletValue(value: string | null | undefined): string | null {
  if (!value) return null
  return value.trim().toLowerCase()
}

export default async function AdminAutoCopyPage() {
  const adminUser = await getAdminSessionUser()

  if (!adminUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#05070E] text-white">
        <p className="max-w-md text-center text-lg">
          Access denied. Please log in with an admin account to view this page.
        </p>
      </div>
    )
  }

  const supabase = createAdminServiceClient()

  const [followsResult, tradesResult, configsResult] = await Promise.all([
    supabase
      .from('follows')
      .select('trader_wallet')
      .eq('user_id', adminUser.id),
    supabase
      .from('orders_copy_enriched')
      .select('copied_trader_wallet, copied_trader_username, trader_profile_image_url, invested_usd, pnl_pct, created_at')
      .eq('copy_user_id', adminUser.id)
      .order('created_at', { ascending: false })
      .limit(MAX_TRADER_HISTORY),
    supabase
      .from('auto_copy_configs')
      .select('*')
      .eq('copy_user_id', adminUser.id)
      .order('updated_at', { ascending: false })
  ])

  if (followsResult.error) {
    console.error('[admin/auto-copy] failed to load follows', followsResult.error)
  }
  if (tradesResult.error) {
    console.error('[admin/auto-copy] failed to load trade history', tradesResult.error)
  }
  if (configsResult.error) {
    console.error('[admin/auto-copy] failed to load configs', configsResult.error)
  }

  const followedWallets = new Set<string>()
  ;(followsResult.data ?? []).forEach((row) => {
    const normalized = normalizeWalletValue(row.trader_wallet)
    if (normalized) {
      followedWallets.add(normalized)
    }
  })

  type Aggregator = {
    wallet: string
    username: string | null
    profileImage: string | null
    copyCount: number
    totalInvested: number
    roiSum: number
    roiCount: number
    lastActivity: string | null
  }

  const aggregator = new Map<string, Aggregator>()

  ;(tradesResult.data ?? []).forEach((row) => {
    const wallet = normalizeWalletValue(row.copied_trader_wallet)
    if (!wallet) return

    const summary = aggregator.get(wallet) ?? {
      wallet,
      username: row.copied_trader_username ?? null,
      profileImage: row.trader_profile_image_url ?? null,
      copyCount: 0,
      totalInvested: 0,
      roiSum: 0,
      roiCount: 0,
      lastActivity: null
    }

    summary.copyCount += 1
    summary.totalInvested += Number(row.invested_usd ?? 0)

    if (typeof row.pnl_pct === 'number' && Number.isFinite(row.pnl_pct)) {
      summary.roiSum += row.pnl_pct
      summary.roiCount += 1
    }

    if (!summary.username && row.copied_trader_username) {
      summary.username = row.copied_trader_username
    }

    if (!summary.profileImage && row.trader_profile_image_url) {
      summary.profileImage = row.trader_profile_image_url
    }

    if (row.created_at) {
      if (!summary.lastActivity || new Date(row.created_at) > new Date(summary.lastActivity)) {
        summary.lastActivity = row.created_at
      }
    }

    aggregator.set(wallet, summary)
  })

  followedWallets.forEach((wallet) => {
    if (!aggregator.has(wallet)) {
      aggregator.set(wallet, {
        wallet,
        username: null,
        profileImage: null,
        copyCount: 0,
        totalInvested: 0,
        roiSum: 0,
        roiCount: 0,
        lastActivity: null
      })
    }
  })

  const traders: TraderSummary[] = Array.from(aggregator.values())
    .map((entry) => ({
      wallet: entry.wallet,
      username: entry.username,
      profileImage: entry.profileImage,
      copyCount: entry.copyCount,
      totalInvested: entry.totalInvested,
      avgRoi: entry.roiCount > 0 ? entry.roiSum / entry.roiCount : null,
      lastActivity: entry.lastActivity,
      followed: followedWallets.has(entry.wallet)
    }))
    .sort((a, b) => {
      if (b.copyCount !== a.copyCount) {
        return b.copyCount - a.copyCount
      }
      if (b.lastActivity && a.lastActivity) {
        return new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime()
      }
      if (b.lastActivity) return 1
      if (a.lastActivity) return -1
      return 0
    })

  const configs: AutoCopyConfig[] = configsResult.data ?? []

  return (
    <AutoCopyAdminConsole
      traders={traders}
      configs={configs}
      adminUser={adminUser}
    />
  )
}
