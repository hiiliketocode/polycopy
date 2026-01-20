#!/usr/bin/env node
/**
 * Find Active Test Markets
 * 
 * Purpose: Find low-stakes active markets suitable for test orders
 * Helps identify a good market to use for testing API integration
 * 
 * Usage:
 *   node scripts/find-test-market.cjs
 */

const POLYMARKET_CLOB_BASE_URL = 'https://clob.polymarket.com'

async function findTestMarkets() {
  try {
    console.log('🔍 Finding active test markets...\n')

    // Fetch active markets
    const response = await fetch(`${POLYMARKET_CLOB_BASE_URL}/markets?limit=50&active=true`)
    const markets = await response.json()

    if (!markets || markets.length === 0) {
      console.log('No active markets found')
      return
    }

    console.log(`Found ${markets.length} active markets\n`)
    console.log('Low-stakes markets suitable for testing:\n')

    // Filter for good test markets
    const testMarkets = markets
      .filter(m => m.active && m.enable_order_book)
      .slice(0, 5) // Take first 5

    testMarkets.forEach((market, idx) => {
      console.log(`${idx + 1}. ${market.question}`)
      console.log(`   Token ID (YES): ${market.tokens?.[0]?.token_id || 'N/A'}`)
      console.log(`   Token ID (NO):  ${market.tokens?.[1]?.token_id || 'N/A'}`)
      console.log(`   Condition ID: ${market.condition_id}`)
      console.log(`   Active: ${market.active}`)
      console.log(`   Order Book: ${market.enable_order_book}`)
      console.log('')
    })

    if (testMarkets.length > 0) {
      const firstMarket = testMarkets[0]
      const yesTokenId = firstMarket.tokens?.[0]?.token_id
      
      console.log('💡 To use the first market for testing, run:')
      console.log(`   TEST_TOKEN_ID="${yesTokenId}" CONFIRM_TEST_ORDER=yes node scripts/test-place-order.cjs`)
    }

  } catch (error) {
    console.error('❌ Failed to fetch markets:', error.message)
    process.exit(1)
  }
}

findTestMarkets()
