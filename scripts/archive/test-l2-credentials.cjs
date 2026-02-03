#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */

const { createClient } = require('@supabase/supabase-js')
const path = require('path')
const dotenvPath = path.join(process.cwd(), '.env.local')
require('dotenv').config({ path: dotenvPath })

async function main() {
  const userId = process.env.TURNKEY_DEV_BYPASS_USER_ID
  if (!userId) {
    console.error('TURNKEY_DEV_BYPASS_USER_ID is required in .env.local')
    process.exit(1)
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: wallet, error } = await supabase
    .from('turnkey_wallets')
    .select('user_id, eoa_address, polymarket_account_address, wallet_type')
    .eq('user_id', userId)
    .single()

  if (error || !wallet) {
    console.error('Failed to fetch wallet row:', error)
    process.exit(1)
  }

  const proxyAddress = wallet.polymarket_account_address || wallet.eoa_address
  const signatureType = wallet.wallet_type === 'imported_magic' ? 2 : 0

const requestBody = JSON.stringify({
  polymarketAccountAddress: proxyAddress,
  signatureType,
})

async function callEndpoint(url) {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: requestBody,
  })
  const body = await resp.json()
  const sanitized = {
    ...body,
    apiKey: body.apiKey ? `${body.apiKey.slice(0, 6)}***` : undefined,
  }
  console.log(`Endpoint ${url} returned ${resp.status}`)
  console.log(`Response:`, sanitized)
  return { status: resp.status, body }
}

console.log('== Dry run ==')
await callEndpoint('http://localhost:3000/api/polymarket/l2-credentials?dryRun=1')

console.log('== First real run ==')
await callEndpoint('http://localhost:3000/api/polymarket/l2-credentials')

console.log('== Second real run (should be cached) ==')
await callEndpoint('http://localhost:3000/api/polymarket/l2-credentials')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
