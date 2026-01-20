import { NextResponse } from 'next/server'

const IS_DEV = process.env.NODE_ENV !== 'production'
const UPSTREAM_SNIPPET_LENGTH = 200

export function buildLocalGuardResponse(
  body: Record<string, unknown>,
  status: number
): NextResponse {
  return NextResponse.json(
    {
      ...body,
      source: 'local_guard',
      upstreamHost: null,
      upstreamStatus: null,
      isHtml: false,
    },
    { status }
  )
}

export function getBodySnippet(value: unknown): string | null {
  if (!IS_DEV) return null
  if (value === undefined || value === null) return null
  let text: string
  if (typeof value === 'string') {
    text = value
  } else {
    try {
      text = JSON.stringify(value)
    } catch {
      text = String(value)
    }
  }
  return text.slice(0, UPSTREAM_SNIPPET_LENGTH)
}
