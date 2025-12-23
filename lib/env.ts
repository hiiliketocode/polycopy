import { POLYMARKET_CLOB_BASE_URL } from '@/lib/turnkey/config'

const DISALLOWED_HOSTNAMES = new Set(['polymarket.com', 'www.polymarket.com'])

export function validatePolymarketClobBaseUrl(url: string): string {
  try {
    const parsed = new URL(url)
    const hostname = parsed.hostname.toLowerCase()
    if (DISALLOWED_HOSTNAMES.has(hostname)) {
      throw new Error('Polymarket CLOB requests must target the sanctioned API host (not polymarket.com)')
    }
    if (parsed.protocol !== 'https:') {
      throw new Error('Polymarket CLOB base URL must use HTTPS')
    }
    return parsed.toString()
  } catch (error: any) {
    throw new Error(
      `Invalid Polymarket CLOB base URL (${url}): ${error?.message ?? 'failed to parse URL'}`
    )
  }
}

export function getValidatedPolymarketClobBaseUrl(): string {
  return validatePolymarketClobBaseUrl(POLYMARKET_CLOB_BASE_URL)
}
