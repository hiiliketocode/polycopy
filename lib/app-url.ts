/**
 * Single source of truth for the app's public base URL.
 * Use this whenever you need to build a URL that might be used from the browser
 * (e.g. when the app is loaded in an iframe, e.g. Ruttl). In production we must
 * never use localhost, or Chrome will block with "connection blocked... public
 * page to local network".
 */
const PRODUCTION_APP_URL = 'https://polycopy.app'

export function getAppBaseUrl(): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
  if (fromEnv) return fromEnv.replace(/\/+$/, '')
  // In production, never expose localhost (e.g. when app is embedded in Ruttl)
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL_URL) {
    return PRODUCTION_APP_URL
  }
  return 'http://localhost:3000'
}
