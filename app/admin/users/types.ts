export type UserProfile = {
  id: string
  email: string | null
  isAdmin: boolean
  isPremium: boolean
  premiumSince: string | null
  wallet: string | null
  createdAt: string | null
  updatedAt: string | null
}

export type UserActivityEvent = {
  id: string
  timestamp: string
  type: 'account_created' | 'went_premium' | 'wallet_added' | 'private_key_imported'
  userId: string | null
  email: string | null
  detail: string
  extra?: string
}
