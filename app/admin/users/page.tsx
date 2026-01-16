import AdminUsersConsole from './AdminUsersConsole'
import { UserActivityEvent, UserProfile } from './types'
import { createAdminServiceClient, getAdminSessionUser } from '@/lib/admin'
import { fetchContentData } from '../content-data/data'
import type { DashboardData } from '../content-data/data'

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

  const users: UserProfile[] = profiles.map((profile) => ({
    id: profile.id,
    email: profile.email,
    isAdmin: Boolean(profile.is_admin),
    isPremium: Boolean(profile.is_premium),
    premiumSince: profile.premium_since ?? null,
    wallet: profile.trading_wallet_address ?? null,
    createdAt: profile.created_at ?? null,
    updatedAt: profile.updated_at ?? null
  }))

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
      contentData={contentData}
    />
  )
}
