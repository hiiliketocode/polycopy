/* eslint-disable no-console */
const fs = require('fs')
const path = require('path')
const { createHash, createDecipheriv } = require('crypto')
const { createClient } = require('@supabase/supabase-js')
const { ClobClient } = require('@polymarket/clob-client')

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
    if (arg.startsWith('--email=')) opts.email = arg.split('=')[1]
    if (arg.startsWith('--user-id=')) opts.userId = arg.split('=')[1]
  }
  return opts
}

function getEncryptionKeyForKid(kid) {
  if (kid === 'v2' && process.env.CLOB_ENCRYPTION_KEY_V2) return process.env.CLOB_ENCRYPTION_KEY_V2
  if (kid === 'v1' && process.env.CLOB_ENCRYPTION_KEY_V1) return process.env.CLOB_ENCRYPTION_KEY_V1
  return process.env.CLOB_ENCRYPTION_KEY || process.env.CLOB_ENCRYPTION_KEY_V1
}

function decryptSecret(ciphertext, kid) {
  const keyMaterial = getEncryptionKeyForKid(kid)
  if (!keyMaterial) {
    throw new Error('Missing CLOB_ENCRYPTION_KEY in env')
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

async function resolveAuthUserByEmail(email, supabaseUrl, serviceKey) {
  const url = `${supabaseUrl}/auth/v1/admin/users?email=${encodeURIComponent(email)}`
  const res = await fetch(url, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Auth admin lookup failed: ${res.status} ${text}`)
  }

  const payload = await res.json()
  const users = Array.isArray(payload) ? payload : payload?.users
  const user = users?.[0]
  if (!user) {
    throw new Error(`No auth user found for email: ${email}`)
  }

  return user
}

async function run() {
  const opts = parseArgs()
  if (!opts.email && !opts.userId) {
    console.error('Usage: node scripts/checkUserClob.cjs --email=... or --user-id=...')
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

  const user = opts.userId
    ? { id: opts.userId, email: null }
    : await resolveAuthUserByEmail(opts.email, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  console.log('User:', { id: user.id, email: user.email })

  const { data: credential } = await supabase
    .from('clob_credentials')
    .select('api_key, api_secret_encrypted, api_passphrase_encrypted, enc_kid, polymarket_account_address, turnkey_address, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!credential) {
    throw new Error('No clob_credentials found for user')
  }

  const proxyAddress = (credential.polymarket_account_address || '').toLowerCase()
  if (!proxyAddress) {
    throw new Error('Missing polymarket_account_address on credentials')
  }

  const signerAddress = (credential.turnkey_address || proxyAddress).toLowerCase()

  const apiCreds = {
    key: credential.api_key,
    secret: decryptSecret(credential.api_secret_encrypted, credential.enc_kid),
    passphrase: decryptSecret(credential.api_passphrase_encrypted, credential.enc_kid),
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_POLYMARKET_CLOB_BASE_URL ||
    process.env.POLYMARKET_CLOB_BASE_URL ||
    'https://clob.polymarket.com'

  const signer = createHeaderOnlySigner(signerAddress)
  const client = new ClobClient(baseUrl, 137, signer, apiCreds)

  console.log('CLOB base:', baseUrl)
  console.log('Proxy:', proxyAddress)
  console.log('Signer:', signerAddress)

  const tradesAny = await client.getTradesPaginated({ limit: 50 })
  const tradesMaker = await client.getTradesPaginated({ maker_address: proxyAddress, limit: 50 })
  const openOrders = await client.getOpenOrders({}, true)

  console.log('Trades (any):', tradesAny?.trades?.length ?? 0)
  console.log('Trades (maker):', tradesMaker?.trades?.length ?? 0)
  console.log('Open orders:', Array.isArray(openOrders) ? openOrders.length : 0)
}

run().catch((err) => {
  console.error('Check failed:', err?.message || err)
  process.exit(1)
})
