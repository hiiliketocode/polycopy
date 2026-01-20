/* eslint-disable no-console */
const fs = require('fs')
const path = require('path')
const { createHash, createDecipheriv } = require('crypto')
const { createClient } = require('@supabase/supabase-js')
const axios = require('axios')
const { createL2Headers } = require('@polymarket/clob-client/dist/headers')

function loadEnv() {
  const candidates = ['.env.local', '.env']
  for (const candidate of candidates) {
    const fullPath = path.resolve(process.cwd(), candidate)
    if (fs.existsSync(fullPath)) {
      require('dotenv').config({ path: fullPath })
      return
    }
  }
}

loadEnv()

function parseArgs() {
  const args = process.argv.slice(2)
  const opts = {}

  for (const arg of args) {
    if (arg.startsWith('--order-id=')) opts.orderId = arg.split('=')[1]
    if (arg.startsWith('--user-id=')) opts.userId = arg.split('=')[1]
    if (arg.startsWith('--proxy=')) opts.proxy = arg.split('=')[1]
  }

  return opts
}

function decryptSecret(ciphertext) {
  const keyMaterial = process.env.CLOB_ENCRYPTION_KEY_V1
  if (!keyMaterial) {
    throw new Error('Missing CLOB_ENCRYPTION_KEY_V1 in env')
  }
  const [ivHex, encrypted] = String(ciphertext || '').split(':')
  if (!ivHex || !encrypted) {
    throw new Error('Invalid encrypted secret format')
  }

  const key = createHash('sha256').update(keyMaterial).digest()
  const iv = Buffer.from(ivHex, 'hex')
  const decipher = createDecipheriv('aes-256-cbc', key, iv)
  let decrypted = decipher.update(encrypted, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

function createHeaderOnlySigner(address) {
  return {
    getAddress: async () => address,
  }
}

function redact(value) {
  if (!value) return value
  if (typeof value === 'string') {
    return value
      .replace(/(\"POLY_API_KEY\":\")[^\"]+\"/g, '$1[REDACTED]"')
      .replace(/(\"POLY_PASSPHRASE\":\")[^\"]+\"/g, '$1[REDACTED]"')
      .replace(/(\"POLY_SIGNATURE\":\")[^\"]+\"/g, '$1[REDACTED]"')
  }
  try {
    const clone = JSON.parse(JSON.stringify(value))
    if (clone?.config?.headers) {
      const headers = { ...clone.config.headers }
      for (const key of Object.keys(headers)) {
        if (key.startsWith('POLY_')) headers[key] = '[REDACTED]'
      }
      clone.config.headers = headers
    }
    return clone
  } catch {
    return value
  }
}

async function run() {
  const opts = parseArgs()
  if (!opts.orderId) {
    console.error('Usage: node scripts/checkClobOrder.cjs --order-id=0x... [--proxy=0x...] [--user-id=...]')
    process.exit(1)
  }

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing Supabase env vars (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)')
    process.exit(1)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  if (!opts.userId) {
    console.error('Missing --user-id=... (required to look up clob_credentials)')
    process.exit(1)
  }

  const { data: credential, error: credError } = await supabase
    .from('clob_credentials')
    .select('user_id, polymarket_account_address, api_key, api_secret_encrypted, api_passphrase_encrypted, created_at')
    .eq('user_id', opts.userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (credError) {
    throw credError
  }

  if (!credential) {
    throw new Error('No clob_credentials found for user')
  }

  const { data: wallet, error: walletError } = await supabase
    .from('turnkey_wallets')
    .select('eoa_address, polymarket_account_address')
    .eq('user_id', opts.userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (walletError) {
    throw walletError
  }

  const signerAddress = (wallet?.eoa_address || '').toLowerCase()
  if (!signerAddress) {
    throw new Error('No turnkey eoa_address found for user')
  }

  const proxyAddress = (opts.proxy || wallet?.polymarket_account_address || credential.polymarket_account_address || '').toLowerCase()
  if (!proxyAddress) {
    throw new Error('Missing proxy address (pass --proxy or set polymarket_account_address)')
  }

  const apiCreds = {
    key: credential.api_key,
    secret: decryptSecret(credential.api_secret_encrypted),
    passphrase: decryptSecret(credential.api_passphrase_encrypted),
  }

  console.log('Using credentials:', {
    user_id: credential.user_id,
    proxy: proxyAddress,
    signer: signerAddress,
    created_at: credential.created_at,
  })

  const baseUrl =
    process.env.NEXT_PUBLIC_POLYMARKET_CLOB_BASE_URL ||
    process.env.POLYMARKET_CLOB_BASE_URL ||
    'https://clob.polymarket.com'

  const originalError = console.error
  console.error = (...args) => {
    originalError(...args.map(redact))
  }

  async function fetchOrderWithAddress(address, label) {
    const requestPath = `/data/order/${opts.orderId}`
    const signer = createHeaderOnlySigner(address)
    const headers = await createL2Headers(signer, apiCreds, {
      method: 'GET',
      requestPath,
    })
    const url = `${baseUrl}${requestPath}`
    console.log(`[${label}] auth address:`, address)
    console.log(`[${label}] requestPath:`, requestPath)
    try {
      const response = await axios.get(url, { headers })
      console.log(`[${label}] status:`, response.status)
      return response.data
    } catch (err) {
      const status = err?.response?.status || 0
      console.log(`[${label}] status:`, status)
      if (err?.response?.data) {
        console.log(`[${label}] error payload:`, err.response.data)
      } else {
        console.log(`[${label}] error payload:`, err?.message || err)
      }
      return null
    }
  }

  await fetchOrderWithAddress(proxyAddress, 'proxy')
  const order = await fetchOrderWithAddress(signerAddress, 'signer')

  if (!order) {
    if (!process.env.CLOB_ENCRYPTION_KEY_V1) {
      console.error('Signer 401 likely due to missing CLOB_ENCRYPTION_KEY_V1')
    } else {
      console.error('Signer 401 likely due to wrong decryption key or requestPath signing mismatch')
    }
    process.exit(1)
  }

  if (!order.id) {
    console.log('Order not found:', opts.orderId)
    return
  }

  console.log('Order:', {
    id: order.id,
    status: order.status,
    side: order.side,
    price: order.price,
    original_size: order.original_size,
    size_matched: order.size_matched,
    market: order.market || order.asset_id,
    outcome: order.outcome,
    created_at: order.created_at,
    owner: order.owner || order.maker_address,
  })
}

run().catch((err) => {
  console.error('Order check failed:', err?.message || err)
  process.exit(1)
})
