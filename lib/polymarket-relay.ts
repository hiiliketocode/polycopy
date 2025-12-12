/**
 * Polymarket Relay Client Setup
 * 
 * NOTE: This file is deprecated in favor of using Privy for wallet management.
 * 
 * For trade execution, use:
 * 1. Get user's Privy wallet ID from database
 * 2. Use Privy's signing API to sign order payloads
 * 3. Submit signed orders to Polymarket CLOB
 * 
 * Private keys are managed by Privy (never by us).
 * See lib/polymarket-trade-executor.ts for implementation.
 */

// This file is kept for backwards compatibility but should not be used
// for new implementations. Use Privy's wallet signing instead.
