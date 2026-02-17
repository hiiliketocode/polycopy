"use client"

import { useCallback, useEffect, useState } from "react"

const STORAGE_KEY = "polycopy_manual_trading_mode"

export function useManualTradingMode(isPremium: boolean, hasWallet: boolean) {
  const [manualModeEnabled, setManualModeEnabled] = useState(false)

  useEffect(() => {
    if (hasWallet) {
      // Wallet connected: no need for manual trading mode
      setManualModeEnabled(false)
      try {
        localStorage.removeItem(STORAGE_KEY)
      } catch {
        // Ignore storage errors
      }
      return
    }

    // No wallet: check if user has opted into manual trading
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      setManualModeEnabled(stored === "true")
    } catch {
      setManualModeEnabled(false)
    }
  }, [hasWallet])

  const enableManualMode = useCallback(() => {
    setManualModeEnabled(true)
    try {
      localStorage.setItem(STORAGE_KEY, "true")
    } catch {
      // Ignore storage errors
    }
  }, [])

  const disableManualMode = useCallback(() => {
    setManualModeEnabled(false)
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // Ignore storage errors
    }
  }, [])

  return {
    manualModeEnabled,
    enableManualMode,
    disableManualMode,
  }
}
