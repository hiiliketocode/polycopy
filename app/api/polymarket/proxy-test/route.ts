import { NextRequest, NextResponse } from 'next/server'
import { ensureEvomiProxyAgent, getEvomiProxyUrl } from '@/lib/evomi/proxy'
import axios from 'axios'

/**
 * Test endpoint to verify proxy configuration and IP location
 * GET /api/polymarket/proxy-test
 */
export async function GET(request: NextRequest) {
  try {
    const proxyUrl = await getEvomiProxyUrl()
    if (!proxyUrl) {
      return NextResponse.json({
        error: 'No Evomi proxy configured',
        configured: false,
        note: 'Set EVOMI_PROXY_URL or EVOMI_PROXY_* environment variables'
      }, { status: 400 })
    }

    // Configure the proxy agent
    await ensureEvomiProxyAgent()

    // Test the proxy by making a request to a service that returns IP info
    // Using ip-api.com (free, no key required) which shows country
    const ipCheckUrl = 'http://ip-api.com/json'
    
    console.log('[PROXY-TEST] Testing proxy with IP check service...')
    
    let ipInfo: any
    try {
      const response = await axios.get(ipCheckUrl, {
        timeout: 10000,
        validateStatus: () => true
      })
      
      if (response.status === 200 && response.data) {
        ipInfo = response.data
      } else {
        return NextResponse.json({
          error: 'IP check service returned unexpected response',
          status: response.status,
          data: response.data
        }, { status: 500 })
      }
    } catch (error: any) {
      return NextResponse.json({
        error: 'Failed to test proxy connection',
        message: error?.message,
        code: error?.code,
        note: 'Proxy may not be working or endpoint may be unreachable'
      }, { status: 500 })
    }

    const proxyEndpoint = proxyUrl.split('@')[1] ?? proxyUrl
    const isFinland = ipInfo?.country === 'Finland' || ipInfo?.countryCode === 'FI'

    return NextResponse.json({
      configured: true,
      proxyEndpoint,
      ipInfo: {
        ip: ipInfo.query,
        country: ipInfo.country,
        countryCode: ipInfo.countryCode,
        city: ipInfo.city,
        region: ipInfo.regionName,
        isp: ipInfo.isp,
        org: ipInfo.org,
      },
      isFinland,
      warning: !isFinland ? '⚠️  Proxy IP is NOT from Finland - may be blocked by Cloudflare' : null,
      note: isFinland 
        ? '✅ Proxy is using Finland IP - should work with Polymarket'
        : '⚠️  Ensure proxy endpoint points to Finland-based server'
    })
  } catch (error: any) {
    return NextResponse.json({
      error: 'Proxy test failed',
      message: error?.message,
      stack: process.env.NODE_ENV === 'development' ? error?.stack : undefined
    }, { status: 500 })
  }
}
