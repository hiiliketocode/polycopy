/**
 * Polymarket Relay Client Setup
 * 
 * NOTE: This file is deprecated in favor of using Turnkey for wallet management.
 * 
 * For trade execution, use:
 * 1. Get user's Turnkey wallet ID from database
 * 2. Use Turnkey signing API to sign order payloads
 * 3. Submit signed orders to Polymarket CLOB
 * 
 * Private keys are managed by Turnkey (never by us).
 * See lib/polymarket-trade-executor.ts for implementation.
 */

// This file is kept for backwards compatibility but should not be used
// for new implementations. Use Turnkey wallet signing instead.
