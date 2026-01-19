import AdminUsersConsole from './AdminUsersConsole'
import { TradeActivitySummary, UserActivityEvent, UserProfile } from './types'
import { createAdminServiceClient, getAdminSessionUser } from '@/lib/admin'
import { fetchContentData } from '../content-data/data'
import type { DashboardData } from '../content-data/data'
import { resolveOrdersTableName } from '@/lib/orders/table'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const MAX_PROFILES = 200
const MAX_WALLETS = 200
const MAX_EVENTS = 200
const MAX_USERS = 200

export default async function AdminUsersPage() {
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

  const [profilesResult, walletsResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, email, is_admin, is_premium, premium_since, trading_wallet_address, created_at, updated_at')
      .order('created_at', { ascending: false })
      .limit(MAX_PROFILES),
    supabase
      .from('turnkey_wallets')
      .select('id, user_id, wallet_type, eoa_address, polymarket_account_address, turnkey_private_key_id, created_at')
      .order('created_at', { ascending: false })
      .limit(MAX_WALLETS)
  ])

  if (profilesResult.error) {
    console.error('[admin/users] failed to fetch profiles', profilesResult.error)
  }

  if (walletsResult.error) {
    console.error('[admin/users] failed to fetch turnkey wallets', walletsResult.error)
  }

  const { data: userListData, error: userListError } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: MAX_USERS
  })

  if (userListError) {
    console.error('[admin/users] failed to list auth users', userListError)
  }

  const profiles = profilesResult.data ?? []
  const wallets = walletsResult.data ?? []
  const authUsers = userListData?.users ?? []

  const profileMap = new Map(profiles.map((profile) => [profile.id, profile]))
  const authCreatedAtMap = new Map(authUsers.map((user) => [user.id, user.created_at ?? null]))

  const events: UserActivityEvent[] = []

  for (const user of authUsers) {
    if (!user.created_at) continue
    events.push({
      id: `auth-${user.id}`,
      timestamp: user.created_at,
      type: 'account_created',
      userId: user.id,
      email: user.email ?? null,
      detail: 'New Supabase auth user created'
    })
  }

  for (const profile of profiles) {
    if (profile.is_premium && profile.premium_since) {
      events.push({
        id: `premium-${profile.id}`,
        timestamp: profile.premium_since,
        type: 'went_premium',
        userId: profile.id,
        email: profile.email,
        detail: 'Became premium'
      })
    }
  }

  for (const wallet of wallets) {
    if (!wallet.created_at) continue
    const hasPrivateKey = Boolean(wallet.turnkey_private_key_id)
    const profile = wallet.user_id ? profileMap.get(wallet.user_id) : undefined
    const address = wallet.polymarket_account_address || wallet.eoa_address || 'unknown'
    events.push({
      id: `wallet-${wallet.id}`,
      timestamp: wallet.created_at,
      type: hasPrivateKey ? 'private_key_imported' : 'wallet_added',
      userId: wallet.user_id ?? null,
      email: profile?.email ?? null,
      detail: hasPrivateKey
        ? `Imported turnkey private key ${wallet.turnkey_private_key_id}`
        : `Linked wallet (${address})`,
      extra: wallet.wallet_type ? `type: ${wallet.wallet_type}` : undefined
    })
  }

  events.sort((a, b) => {
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  })

  const trimmedEvents = events.slice(0, MAX_EVENTS)

  const baseUsers = authUsers.length
    ? authUsers
    : profiles.map((profile) => ({
        id: profile.id,
        email: profile.email,
        created_at: profile.created_at ?? null,
        updated_at: profile.updated_at ?? null
      }))

  const users: UserProfile[] = baseUsers.map((user) => {
    const profile = profileMap.get(user.id)
    return {
      id: user.id,
      email: profile?.email ?? user.email ?? null,
      isAdmin: Boolean(profile?.is_admin),
      isPremium: Boolean(profile?.is_premium),
      premiumSince: profile?.premium_since ?? null,
      wallet: profile?.trading_wallet_address ?? null,
      createdAt: profile?.created_at ?? user.created_at ?? null,
      updatedAt: profile?.updated_at ?? user.updated_at ?? null
    }
  })

  const userIds = users.map((user) => user.id)

  let tradeRows: Array<{
    copy_user_id: string | null
    trade_method: string | null
    invested_usd?: number | null
    pnl_usd?: number | null
    amount_invested?: number | null
    roi?: number | null
    created_at?: string | null
  }> = []

  let followsResult: { data: Array<{ user_id: string | null }> | null; error: any } = {
    data: [],
    error: null
  }

  if (userIds.length) {
    const tradesResult = await supabase
      .from('orders_copy_enriched')
      .select('copy_user_id, trade_method, invested_usd, pnl_usd, created_at')
      .in('copy_user_id', userIds)

    if (tradesResult.error) {
      const message = String(tradesResult.error?.message || '')
      const isMissingRelation =
        tradesResult.error?.code === '42P01' ||
        message.toLowerCase().includes('does not exist')
      console.error('[admin/users] failed to fetch trade activity', tradesResult.error)

      if (isMissingRelation) {
        try {
          const ordersTable = await resolveOrdersTableName(supabase)
          if (ordersTable === 'orders') {
            const fallbackResult = await supabase
              .from('orders')
              .select('copy_user_id, trade_method, amount_invested, roi, created_at')
              .in('copy_user_id', userIds)
            if (fallbackResult.error) {
              console.error('[admin/users] fallback orders query failed', fallbackResult.error)
            } else {
              tradeRows = fallbackResult.data ?? []
            }
          }
        } catch (error) {
          console.error('[admin/users] failed to resolve orders table for fallback', error)
        }
      }
    } else {
      tradeRows = tradesResult.data ?? []
    }

    followsResult = await supabase
      .from('follows')
      .select('user_id')
      .in('user_id', userIds)
  }

  if (followsResult.error) {
    console.error('[admin/users] failed to fetch follows counts', followsResult.error)
  }

  const followCounts = new Map<string, number>()
  for (const follow of followsResult.data ?? []) {
    if (!follow.user_id) continue
    followCounts.set(follow.user_id, (followCounts.get(follow.user_id) || 0) + 1)
  }

  const tradeStats = new Map<
    string,
    { tradeVolume: number; tradeCount: number; pnl: number; activeDays: Set<string> }
  >()

  for (const trade of tradeRows) {
    const userId = trade.copy_user_id
    if (!userId) continue
    const method = trade.trade_method
    if (method && method !== 'manual' && method !== 'quick') continue

    const volume = Number(trade.invested_usd ?? trade.amount_invested ?? 0)
    const pnl = Number(
      trade.pnl_usd ??
        (trade.amount_invested !== null && trade.amount_invested !== undefined && trade.roi !== null && trade.roi !== undefined
          ? Number(trade.amount_invested) * (Number(trade.roi) / 100)
          : 0)
    )
    const createdAt = trade.created_at ? new Date(trade.created_at) : null
    const dayKey = createdAt && !Number.isNaN(createdAt.getTime())
      ? createdAt.toISOString().slice(0, 10)
      : null

    const summary = tradeStats.get(userId) ?? {
      tradeVolume: 0,
      tradeCount: 0,
      pnl: 0,
      activeDays: new Set<string>()
    }

    if (Number.isFinite(volume)) summary.tradeVolume += volume
    if (Number.isFinite(pnl)) summary.pnl += pnl
    summary.tradeCount += 1
    if (dayKey) summary.activeDays.add(dayKey)

    tradeStats.set(userId, summary)
  }

  const tradeActivity: TradeActivitySummary[] = users.map((user) => {
    const stats = tradeStats.get(user.id)
    const userType = user.isAdmin ? 'Admin' : user.isPremium ? 'Premium' : 'Free'
    return {
      id: user.id,
      email: user.email,
      userType,
      signUpDate: authCreatedAtMap.get(user.id) ?? user.createdAt,
      premiumDate: user.premiumSince,
      tradeVolume: stats?.tradeVolume ?? 0,
      tradeCount: stats?.tradeCount ?? 0,
      pnl: stats?.pnl ?? 0,
      followsCount: followCounts.get(user.id) ?? 0,
      activeDays: stats?.activeDays.size ?? 0
    }
  })

  let contentData: DashboardData | null = null
  try {
    contentData = await fetchContentData()
  } catch (error) {
    console.error('[admin/users] failed to fetch content data', error)
  }

  return (
    <AdminUsersConsole
      users={users}
      events={trimmedEvents}
      tradeActivity={tradeActivity}
      contentData={contentData}
    />
  )
}
