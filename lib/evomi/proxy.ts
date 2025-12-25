import axios from 'axios'
import { HttpsProxyAgent } from 'https-proxy-agent'

const EVOMI_PUBLIC_ENDPOINT = 'https://api.evomi.com/public'
const DEFAULT_PRODUCT_CODE = 'rpc'

type EvomiProduct = {
  username?: string
  password?: string
  endpoint?: string
  ports?: {
    http?: number
    https?: number
    socks5?: number
  }
}

type EvomiProducts = Record<string, EvomiProduct>

function getManualProxyUrl(): string | null {
  const manualUrl = process.env.EVOMI_PROXY_URL?.trim()
  if (manualUrl) {
    return manualUrl
  }

  const endpoint = process.env.EVOMI_PROXY_ENDPOINT?.trim()
  if (!endpoint) {
    return null
  }
  const username = process.env.EVOMI_PROXY_USERNAME?.trim()
  const password = process.env.EVOMI_PROXY_PASSWORD?.trim()
  if (!username || !password) {
    return null
  }

  const portRaw = process.env.EVOMI_PROXY_PORT?.trim()
  const port = portRaw ? Number(portRaw) : NaN
  let host = endpoint
  if (portRaw) {
    if (!Number.isFinite(port) || port <= 0) {
      return null
    }
    host = `${endpoint}:${Math.round(port)}`
  }
  const protocol = getProtocol()
  return `${protocol}://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}`
}

function hasApiKey(): boolean {
  return Boolean(process.env.EVOMI_API_KEY)
}

function getProductCode(): string {
  const code = process.env.EVOMI_PROXY_PRODUCT?.trim()
  return code && code.length > 0 ? code : DEFAULT_PRODUCT_CODE
}

function getProtocol(): 'http' | 'https' {
  const proto = process.env.EVOMI_PROXY_PROTOCOL?.toLowerCase()
  if (proto === 'https') return 'https'
  return 'http'
}

function getCacheTtlMs(): number {
  const candidate = Number(process.env.EVOMI_PROXY_CACHE_SECONDS)
  if (Number.isFinite(candidate) && candidate > 0) {
    return Math.round(candidate * 1000)
  }
  return 5 * 60 * 1000
}

let proxyCache: { url: string; expiresAt: number } | null = null
let inFlightFetch: Promise<string | null> | null = null
let configuredProxyUrl: string | null = null

function chooseProduct(products: EvomiProducts): EvomiProduct | null {
  const code = getProductCode()
  if (code && products[code]) {
    return products[code]
  }
  const keys = Object.keys(products)
  if (keys.length === 0) return null
  return products[keys[0]]
}

function ensurePort(
  product: EvomiProduct,
  protocol: 'http' | 'https'
): number | undefined {
  if (!product.ports) return undefined
  if (protocol === 'http' && product.ports.http) return product.ports.http
  if (protocol === 'https' && product.ports.https) return product.ports.https
  return product.ports.http ?? product.ports.https ?? product.ports.socks5
}

function buildProxyUrl(product: EvomiProduct, protocol: 'http' | 'https'): string | null {
  const username = product.username ?? ''
  const password = product.password ?? ''
  const endpoint = product.endpoint
  const port = ensurePort(product, protocol)
  if (!endpoint || !port) return null
  const encodedUsername = encodeURIComponent(username)
  const encodedPassword = encodeURIComponent(password)
  return `${protocol}://${encodedUsername}:${encodedPassword}@${endpoint}:${port}`
}

async function fetchProducts(): Promise<EvomiProducts> {
  const apiKey = process.env.EVOMI_API_KEY
  if (!apiKey) return {}
  const resp = await fetch(EVOMI_PUBLIC_ENDPOINT, {
    headers: {
      'X-API-KEY': apiKey,
      'Accept': 'application/json',
    },
  })
  if (!resp.ok) {
    throw new Error(`Evomi API responded ${resp.status}`)
  }
  const payload = (await resp.json()) as { products?: EvomiProducts }
  return payload.products ?? {}
}

async function fetchProxyUrlFromApi(): Promise<string | null> {
  if (!hasApiKey()) return null
  const products = await fetchProducts()
  const product = chooseProduct(products)
  if (!product) {
    throw new Error('Evomi API returned no proxy products')
  }
  const protocol = getProtocol()
  const url = buildProxyUrl(product, protocol)
  if (!url) {
    throw new Error(
      `Evomi proxy (${getProductCode()}) is missing endpoint/ports for protocol ${protocol}`
    )
  }
  return url
}

export async function getEvomiProxyUrl(): Promise<string | null> {
  const manual = getManualProxyUrl()
  if (manual) {
    return manual
  }

  if (!hasApiKey()) return null
  const now = Date.now()
  if (proxyCache && proxyCache.expiresAt > now) {
    return proxyCache.url
  }
  if (inFlightFetch) {
    return inFlightFetch
  }
  inFlightFetch = (async () => {
    try {
      const url = await fetchProxyUrlFromApi()
      if (url) {
        proxyCache = {
          url,
          expiresAt: Date.now() + getCacheTtlMs(),
        }
      }
      return url
    } finally {
      inFlightFetch = null
    }
  })()
  return inFlightFetch
}

export async function ensureEvomiProxyAgent(): Promise<string | null> {
  const url = await getEvomiProxyUrl()
  if (!url) {
    configuredProxyUrl = null
    return null
  }
  if (configuredProxyUrl === url) {
    return url
  }
  const agent = new HttpsProxyAgent(url)
  axios.defaults.httpAgent = agent
  axios.defaults.httpsAgent = agent
  axios.defaults.proxy = false
  configuredProxyUrl = url
  console.log('[EVOMI] Proxy configured via', url.split('@')[1] ?? url)
  return url
}

