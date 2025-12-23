/* eslint-disable no-console */
import axios from 'axios'
import { createClient } from '@supabase/supabase-js'
import { createHash, createDecipheriv } from 'crypto'
import { ClobClient } from '@polymarket/clob-client'
import { createL2Headers } from '@polymarket/clob-client/dist/headers'
import { GET_OPEN_ORDERS, GET_TRADES } from '@polymarket/clob-client/dist/endpoints'
import { POLYMARKET_CLOB_BASE_URL } from '@/lib/turnkey/config'
import {
  CLOB_ENCRYPTION_KEY,
  CLOB_ENCRYPTION_KEY_V1,
  CLOB_ENCRYPTION_KEY_V2,
} from '@/lib/turnkey/config'

type CliOptions = {
  userId?: string
  proxy?: string
  signer?: string
  limit?: number
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing Supabase env vars (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

function parseArgs(): CliOptions {
  const args = process.argv.slice(2)
  const opts: CliOptions = {}

  for (const arg of args) {
    if (arg.startsWith('--user-id=')) opts.userId = arg.split('=')[1]
    if (arg.startsWith('--proxy=')) opts.proxy = arg.split('=')[1]
    if (arg.startsWith('--signer=')) opts.signer = arg.split('=')[1]
    if (arg.startsWith('--limit=')) opts.limit = parseInt(arg.split('=')[1], 10)
  }

  return opts
}

function getEncryptionKeyForKid(kid?: string | null): string {
  if (kid === 'v2' && CLOB_ENCRYPTION_KEY_V2) {
    return CLOB_ENCRYPTION_KEY_V2
  }
  if (kid === 'v1' && CLOB_ENCRYPTION_KEY_V1) {
    return CLOB_ENCRYPTION_KEY_V1
  }
  return CLOB_ENCRYPTION_KEY
}

function decryptSecret(ciphertext: string, kid?: string | null): string {
  const [ivHex, encrypted] = ciphertext.split(':')
  if (!ivHex || !encrypted) {
    throw new Error('Invalid encrypted secret format')
  }

  const keyMaterial = getEncryptionKeyForKid(kid)
  const key = createHash('sha256').update(keyMaterial).digest()
  const iv = Buffer.from(ivHex, 'hex')
  const decipher = createDecipheriv('aes-256-cbc', key, iv)
  let decrypted = decipher.update(encrypted, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

function createHeaderOnlySigner(address: string) {
  return {
    getAddress: async () => address
  } as any
}

function summarizeItems(items: any[], keys: string[]) {
  return items.slice(0, 3).map((item) => {
    const summary: Record<string, unknown> = {}
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(item, key)) {
        summary[key] = item[key]
      }
    }
    return summary
  })
}

function extractCount(payload: any): number {
  if (!payload) return 0
  if (Array.isArray(payload)) return payload.length
  if (Array.isArray(payload.trades)) return payload.trades.length
  if (Array.isArray(payload.data)) return payload.data.length
  return 0
}

async function callEndpoint(address: string, endpoint: string, params: Record<string, string | number>) {
  const signer = createHeaderOnlySigner(address)
  const creds = await loadApiCreds()
  const headerArgs = { method: 'GET', requestPath: endpoint }
  const headers = await createL2Headers(signer, creds, headerArgs)

  const url = `${POLYMARKET_CLOB_BASE_URL}${endpoint}`
  try {
    const response = await axios.get(url, { headers, params })
    return {
      status: response.status,
      data: response.data
    }
  } catch (err: any) {
    if (err?.response) {
      return {
        status: err.response.status,
        data: err.response.data,
        error: err.response.statusText || err.message
      }
    }
    return { status: 0, data: null, error: err?.message || String(err) }
  }
}

let cachedCreds: { key: string; secret: string; passphrase: string } | null = null
async function loadApiCreds() {
  if (cachedCreds) return cachedCreds
  const opts = parseArgs()
  if (!opts.userId) {
    throw new Error('Provide --user-id=...')
  }

  const { data: credential, error } = await supabase
    .from('clob_credentials')
    .select('api_key, api_secret_encrypted, api_passphrase_encrypted, enc_kid, created_at')
    .eq('user_id', opts.userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !credential) {
    throw new Error('No clob_credentials found for user')
  }

  cachedCreds = {
    key: credential.api_key,
    secret: decryptSecret(credential.api_secret_encrypted, credential.enc_kid),
    passphrase: decryptSecret(credential.api_passphrase_encrypted, credential.enc_kid)
  }
  return cachedCreds
}

async function run() {
  const opts = parseArgs()
  const limit = opts.limit && opts.limit > 0 ? opts.limit : 50

  if (!opts.userId || !opts.proxy || !opts.signer) {
    console.error('Usage: --user-id=... --proxy=0x... --signer=0x... [--limit=50]')
    process.exit(1)
  }

  const results: Record<string, any> = {}

  for (const address of [opts.proxy, opts.signer]) {
    console.log(`\n=== Address: ${address} ===`)

    const tradesParams = { limit }
    const ordersParams = { limit }

    console.log('GET', GET_TRADES, tradesParams)
    const tradesResp = await callEndpoint(address, GET_TRADES, tradesParams)
    const tradesData = tradesResp.data
    const tradesCount = extractCount(tradesData)
    const tradesList = Array.isArray(tradesData?.trades) ? tradesData.trades : tradesData?.data || []
    console.log('Status:', tradesResp.status)
    console.log('Keys:', Object.keys(tradesData || {}))
    console.log('Sample:', summarizeItems(tradesList, ['id', 'taker_order_id', 'market', 'asset_id', 'price', 'size', 'side']))
    console.log('Count:', tradesCount)

    console.log('GET', GET_OPEN_ORDERS, ordersParams)
    const ordersResp = await callEndpoint(address, GET_OPEN_ORDERS, ordersParams)
    const ordersData = ordersResp.data
    const ordersCount = extractCount(ordersData)
    const ordersList = Array.isArray(ordersData) ? ordersData : ordersData?.data || []
    console.log('Status:', ordersResp.status)
    console.log('Keys:', Object.keys(ordersData || {}))
    console.log('Sample:', summarizeItems(ordersList, ['id', 'market', 'asset_id', 'price', 'original_size', 'side', 'status']))
    console.log('Count:', ordersCount)

    results[address] = {
      tradesCount,
      ordersCount,
      tradesSample: summarizeItems(tradesList, ['id', 'taker_order_id']),
      ordersSample: summarizeItems(ordersList, ['id'])
    }

    if (tradesCount > 0 || ordersCount > 0) {
      console.log(`SUCCESS: address ${address} returns ${tradesCount + ordersCount} results`)
      break
    }
  }

  const a = opts.proxy
  const b = opts.signer
  console.log('\n=== Summary ===')
  console.log(`Orders with address A (${a}): count=${results[a]?.ordersCount ?? 0}`)
  console.log(`Orders with address B (${b}): count=${results[b]?.ordersCount ?? 0}`)
  console.log(`Trades with address A (${a}): count=${results[a]?.tradesCount ?? 0}`)
  console.log(`Trades with address B (${b}): count=${results[b]?.tradesCount ?? 0}`)
  const winner =
    (results[a]?.ordersCount || 0) + (results[a]?.tradesCount || 0) > 0
      ? a
      : (results[b]?.ordersCount || 0) + (results[b]?.tradesCount || 0) > 0
        ? b
        : 'none'
  console.log(`Winner identity: ${winner}`)
  console.log(`Sample order_id(s):`, results[winner]?.ordersSample || [])
  console.log(`Sample trade_id(s):`, results[winner]?.tradesSample || [])
}

run().catch((err) => {
  console.error('Debug pull failed:', err?.message || err)
  process.exit(1)
})
