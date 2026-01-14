export type TraderSummary = {
  wallet: string
  username: string | null
  profileImage: string | null
  copyCount: number
  avgRoi: number | null
  totalInvested: number
  lastActivity: string | null
  followed: boolean
}

export type AutoCopyConfig = {
  id: string
  copy_user_id: string
  trader_wallet: string
  trader_username: string | null
  trader_profile_image_url: string | null
  min_trade_size_pct: number | null
  max_trade_size_pct: number | null
  allocation_usd: number | null
  max_trades_per_day: number | null
  risk_tolerance_pct: number | null
  time_window_start: string | null
  time_window_end: string | null
  paused: boolean
  last_simulation_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export type AutoCopyLog = {
  id: string
  config_id: string | null
  copy_user_id: string
  trader_wallet: string
  trader_username: string | null
  trader_profile_image_url: string | null
  market_id: string | null
  market_slug: string | null
  market_title: string | null
  market_avatar_url: string | null
  outcome: string | null
  side: string | null
  size: number | null
  price: number | null
  amount_usd: number | null
  allocation_usd: number | null
  notes: string | null
  status: string | null
  trade_method: string | null
  executed_at: string | null
  created_at: string | null
  updated_at: string | null
}
