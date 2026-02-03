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

export type TradeActivitySummary = {
  id: string
  email: string | null
  userType: 'Admin' | 'Premium' | 'Free'
  signUpDate: string | null
  premiumDate: string | null
  tradeVolume: number
  tradeCount: number
  pnl: number
  followsCount: number
  activeDays: number
}

export type AdminUserSummary = {
  // Row 1: Cumulative totals
  totalSignUps: number
  totalCopies: number
  manualCopies: number
  quickCopies: number
  
  // Row 2: Premium & wallets
  premiumCount: number
  walletsConnected: number
  
  // Row 3: Last 24 hours
  signUps24h: number
  premiumUpgrades24h: number
  manualCopies24h: number
  quickCopies24h: number
}
