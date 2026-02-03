#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Test Order Placement Script
 * 
 * Purpose: Verify Polymarket API key is working by placing a small test order
 * This helps Polymarket dev rel see transactions from our API key
 * 
 * Usage:
 *   node scripts/test-place-order.cjs
 * 
 * Requirements:
 *   - .env.local with POLYMARKET_CLOB_API_* credentials
 *   - Test market token ID (provided in script)
 *   - Small amount of USDC in the wallet for test order
 */

const path = require('path')
const dotenvPath = path.join(process.cwd(), '.env.local')
require('dotenv').config({ path: dotenvPath })

const { ClobClient } = require('@polymarket/clob-client')

const POLYMARKET_CLOB_BASE_URL = 'https://clob.polymarket.com'
const POLYGON_CHAIN_ID = 137

// Test market configuration
// Using a low-stakes, active market for testing
const TEST_CONFIG = {
  // This is a test token ID - you should replace with an active market
  // You can find active markets at: https://clob.polymarket.com/markets
  tokenId: process.env.TEST_TOKEN_ID || '21742633143463906290569050155826241533067272736897614950488156847949938836455',
  price: 0.50, // Price in the middle (50%)
  size: 1.0,   // 1 contract = ~$0.50 investment at 50% price
  side: 'BUY', // BUY or SELL
}

function loadCredentials() {
  const key = process.env.POLYMARKET_CLOB_API_KEY
  const secret = process.env.POLYMARKET_CLOB_API_SECRET
  const passphrase = process.env.POLYMARKET_CLOB_API_PASSPHRASE
  const address = process.env.POLYMARKET_CLOB_API_ADDRESS

  if (!key || !secret || !passphrase || !address) {
    throw new Error('Missing Polymarket CLOB API credentials in .env.local\n' +
      'Required: POLYMARKET_CLOB_API_KEY, POLYMARKET_CLOB_API_SECRET, POLYMARKET_CLOB_API_PASSPHRASE, POLYMARKET_CLOB_API_ADDRESS')
  }

  return { key, secret, passphrase, address }
}

function createHeaderOnlySigner(address) {
  return {
    getAddress: async () => address
  }
}

function createClient(creds) {
  const signer = createHeaderOnlySigner(creds.address)
  const client = new ClobClient(
    POLYMARKET_CLOB_BASE_URL,
    POLYGON_CHAIN_ID,
    signer,
    {
      key: creds.key,
      secret: creds.secret,
      passphrase: creds.passphrase
    }
  )

  // Configure builder headers
  if (typeof client.axiosInstance !== 'undefined') {
    client.axiosInstance.defaults.headers.common['x-builder-name'] = 'Polycopy'
    client.axiosInstance.defaults.headers.common['User-Agent'] = 'Polycopy/1.0'
    console.log('✅ Builder headers configured: Polycopy')
  }

  return client
}

async function checkMarketInfo(client, tokenId) {
  try {
    console.log('\n📊 Fetching market info...')
    const url = `${POLYMARKET_CLOB_BASE_URL}/markets?token_id=${tokenId}`
    const response = await fetch(url)
    const markets = await response.json()
    
    if (markets && markets.length > 0) {
      const market = markets[0]
      console.log(`Market: ${market.question || 'Unknown'}`)
      console.log(`Condition ID: ${market.condition_id}`)
      console.log(`Active: ${market.active}`)
      return market
    } else {
      console.log('⚠️  Market not found - may need to update TEST_TOKEN_ID')
      return null
    }
  } catch (error) {
    console.log('⚠️  Could not fetch market info:', error.message)
    return null
  }
}

async function checkBalance(client) {
  try {
    console.log('\n💰 Checking balance...')
    // This would require additional setup to check USDC balance
    // For now, we'll skip this check
    console.log('⚠️  Balance check skipped (requires additional setup)')
  } catch (error) {
    console.log('⚠️  Could not check balance:', error.message)
  }
}

async function placeTestOrder(client, config) {
  try {
    console.log('\n🚀 Placing test order...')
    console.log(`Token ID: ${config.tokenId}`)
    console.log(`Side: ${config.side}`)
    console.log(`Price: $${config.price}`)
    console.log(`Size: ${config.size} contracts`)
    console.log(`Estimated cost: $${(config.price * config.size).toFixed(2)}`)

    // Create the order
    const order = await client.createOrder({
      tokenID: config.tokenId,
      price: config.price,
      size: config.size,
      side: config.side,
    })

    console.log('\n✅ Order created (signed):')
    console.log(`Order ID: ${order.orderID || 'N/A'}`)

    // Post the order to the exchange
    console.log('\n📤 Posting order to exchange...')
    const result = await client.postOrder(order, 'GTC')

    console.log('\n✅ ORDER PLACED SUCCESSFULLY!')
    console.log('Order Details:')
    console.log(JSON.stringify(result, null, 2))

    if (result.orderID) {
      console.log(`\n🔍 View order: https://clob.polymarket.com/orders/${result.orderID}`)
    }

    return result
  } catch (error) {
    console.error('\n❌ Order placement failed:')
    console.error(error.message)
    if (error.response) {
      console.error('Response data:', error.response.data)
    }
    throw error
  }
}

async function main() {
  console.log('🧪 Polymarket API Test Order Script')
  console.log('====================================\n')

  try {
    // Load credentials
    console.log('🔑 Loading API credentials...')
    const creds = loadCredentials()
    console.log(`✅ Credentials loaded for wallet: ${creds.address}`)

    // Create client
    console.log('\n🔌 Creating CLOB client...')
    const client = createClient(creds)
    console.log('✅ CLOB client created')

    // Check market info
    await checkMarketInfo(client, TEST_CONFIG.tokenId)

    // Check balance (optional)
    await checkBalance(client)

    // Ask for confirmation
    console.log('\n⚠️  WARNING: This will place a REAL order on Polymarket!')
    console.log(`Estimated cost: $${(TEST_CONFIG.price * TEST_CONFIG.size).toFixed(2)}`)
    console.log('\nTo proceed, set environment variable: CONFIRM_TEST_ORDER=yes')
    
    if (process.env.CONFIRM_TEST_ORDER !== 'yes') {
      console.log('\n⏸️  Test order NOT placed (confirmation required)')
      console.log('To place test order, run:')
      console.log('  CONFIRM_TEST_ORDER=yes node scripts/test-place-order.cjs')
      return
    }

    // Place test order
    const result = await placeTestOrder(client, TEST_CONFIG)

    console.log('\n✅ TEST COMPLETE')
    console.log('Your Polymarket dev rel should now see this transaction')

  } catch (error) {
    console.error('\n❌ TEST FAILED')
    console.error(error.message)
    process.exit(1)
  }
}

main()
