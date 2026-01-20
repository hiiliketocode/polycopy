import { NextRequest, NextResponse } from 'next/server'
import { POST as placeOrder } from '../../orders/place/route'

const HANDLER_FINGERPRINT = 'app/api/polymarket/positions/close/route.ts'

// Delegate close requests to the shared placement handler; keep this wrapper so
// we can normalize close-specific payloads later without re-exporting blindly.
export async function POST(request: NextRequest) {
  const upstreamResponse = await placeOrder(request)

  let parsedBody: any = null
  try {
    const text = await upstreamResponse.text()
    parsedBody = text ? JSON.parse(text) : {}
  } catch (error) {
    parsedBody = { raw: 'non-json response from delegated handler' }
  }

  const downstreamHandler =
    parsedBody && typeof parsedBody.handlerFingerprint === 'string'
      ? parsedBody.handlerFingerprint
      : undefined

  const payload = {
    handlerFingerprint: HANDLER_FINGERPRINT,
    downstreamHandler,
    ...parsedBody,
  }

  const headers = new Headers(upstreamResponse.headers)
  headers.set('x-polycopy-handler', HANDLER_FINGERPRINT)
  headers.set('content-type', 'application/json')

  return NextResponse.json(payload, {
    status: upstreamResponse.status,
    headers,
  })
}
