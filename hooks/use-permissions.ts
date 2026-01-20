"use client"

export function usePermissions(user?: { id: string } | null, isPremium?: boolean) {
  // If parent provides user and isPremium, use those
  // Otherwise default to false (not authenticated/not premium)
  return {
    isPremium: isPremium ?? false,
    canExecuteTrades: isPremium ?? false,
    canViewAdvancedStats: isPremium ?? false,
    canFollow: user !== null && user !== undefined,
    canMarkAsCopied: user !== null && user !== undefined,
    showPremiumUpsells: user !== null && user !== undefined && !isPremium,
    isFree: user !== null && user !== undefined && !isPremium,
  }
}
