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
  let manualUrl = process.env.EVOMI_PROXY_URL?.trim()
  if (manualUrl) {
    // Check if password already includes country parameter
    const hasCountryParam = /_country-/.test(manualUrl)
    const countryCode = process.env.EVOMI_PROXY_COUNTRY?.trim()?.toUpperCase()
    
    if (!hasCountryParam && countryCode) {
      // Parse the URL and add country parameter to password
      // Format: protocol://username:password@host:port
      try {
        // Use URL parsing to handle encoding properly
        const url = new URL(manualUrl)
        const username = url.username
        let password = decodeURIComponent(url.password || '')
        
        // Add country parameter if not already present
        if (password && !password.includes('_country-')) {
          password = `${password}_country-${countryCode}`
          url.password = encodeURIComponent(password)
          manualUrl = url.toString()
          console.log(`[EVOMI] Added country parameter to proxy URL: _country-${countryCode}`)
        }
      } catch (error) {
        // Fallback to regex parsing if URL constructor fails
        try {
          const urlMatch = manualUrl.match(/^(\w+):\/\/([^:]+):([^@]+)@(.+)$/)
          if (urlMatch) {
            const [, protocol, username, encodedPassword, host] = urlMatch
            const password = decodeURIComponent(encodedPassword)
            if (!password.includes('_country-')) {
              const updatedPassword = encodeURIComponent(`${password}_country-${countryCode}`)
              manualUrl = `${protocol}://${username}:${updatedPassword}@${host}`
              console.log(`[EVOMI] Added country parameter to proxy URL: _country-${countryCode}`)
            }
          } else {
            console.warn('[EVOMI] Could not parse EVOMI_PROXY_URL to add country parameter. Please add _country-FI manually to password.')
          }
        } catch (fallbackError) {
          console.warn('[EVOMI] Error parsing EVOMI_PROXY_URL:', fallbackError)
        }
      }
    }
    return manualUrl
  }

  const endpoint = process.env.EVOMI_PROXY_ENDPOINT?.trim()
  if (!endpoint) {
    return null
  }
  const username = process.env.EVOMI_PROXY_USERNAME?.trim()
  let password = process.env.EVOMI_PROXY_PASSWORD?.trim()
  if (!username || !password) {
    return null
  }

  // Add country parameter to password if EVOMI_PROXY_COUNTRY is set and not already present
  const countryCode = process.env.EVOMI_PROXY_COUNTRY?.trim()?.toUpperCase()
  if (countryCode && !/_country-/.test(password)) {
    password = `${password}_country-${countryCode}`
    console.log(`[EVOMI] Added country parameter: _country-${countryCode}`)
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
let axiosInterceptorAdded = false

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
    console.log('[EVOMI] No proxy URL available - requests will go direct')
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
  
  // Add response interceptor to prevent circular reference errors
  if (!axiosInterceptorAdded) {
    axios.interceptors.response.use(
      (response) => response,
      (error) => {
        // If the error config contains httpAgent/httpsAgent, it means the proxy agent
        // is causing a circular reference during serialization. Remove it.
        if (error.config && (error.config.httpAgent || error.config.httpsAgent)) {
          delete error.config.httpAgent
          delete error.config.httpsAgent
        }
        return Promise.reject(error)
      }
    )
    axiosInterceptorAdded = true
  }
  
  // Extract proxy info for logging (without credentials)
  const proxyInfo = url.split('@')[1] ?? url
  const protocol = url.startsWith('https://') ? 'https' : 'http'
  
  // Check if password contains country parameter
  const hasCountryParam = /_country-/.test(url)
  const countryMatch = url.match(/_country-([A-Z]{2})/i)
  const countryCode = countryMatch ? countryMatch[1] : null
  
  console.log('[EVOMI] Proxy configured:', {
    protocol,
    endpoint: proxyInfo,
    hasCountryParam,
    countryCode: countryCode || 'none',
    usingAxiosDefaults: true,
    warning: !hasCountryParam ? '⚠️  No country parameter in proxy URL - may use random location' : null,
    note: hasCountryParam && countryCode !== 'FI' 
      ? `⚠️  Proxy country is ${countryCode}, not FI (Finland)` 
      : hasCountryParam && countryCode === 'FI'
      ? '✅ Proxy configured for Finland'
      : 'Ensure endpoint points to Finland IP for Polymarket access'
  })
  
  return url
}

export async function requireEvomiProxyAgent(context?: string): Promise<string> {
  try {
    const url = await ensureEvomiProxyAgent()
    if (!url) {
      throw new Error('Evomi proxy not configured')
    }
    return url
  } catch (error: any) {
    const message = error?.message || error
    const suffix = context ? ` (${context})` : ''
    throw new Error(`Evomi proxy required${suffix}: ${message}`)
  }
}
