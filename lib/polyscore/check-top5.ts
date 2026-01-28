/**
 * Top 5 traders wallet addresses (30D window)
 * These are the wallets we have ML models trained on
 * 
 * To update this list:
 * Run: node scripts/get-top5-wallets-simple.js
 * Then copy the output array here
 */
const TOP5_WALLETS = [
  '0x6a72f61820b26b1fe4d956e17b6dc2a1ea3033ee',
  '0x0d3b10b8eac8b089c6e4a695e65d8e044167c46b',
  '0xdb27bf2ac5d428a9c63dbc914611036855a6c56e',
  '0xdc876e6873772d38716fda7f2452a78d426d7ab6',
  '0x006cc834cc092684f1b56626e23bedb3835c16ea',
] as const

/**
 * Check if a wallet address is in the top 5 traders
 * Uses hardcoded list for performance - no database query needed
 */
export function isTop5Trader(walletAddress: string): boolean {
  if (!walletAddress) return false
  
  const normalized = walletAddress.toLowerCase().trim()
  return TOP5_WALLETS.includes(normalized as any)
}

/**
 * Get the list of top 5 wallet addresses
 */
export function getTop5Wallets(): readonly string[] {
  return TOP5_WALLETS
}
