import { NextResponse } from 'next/server'
import { getAdminSessionUser } from '@/lib/admin'
import { fetchContentData } from '@/app/admin/content-data/data'
import type { DashboardData } from '@/app/admin/content-data/data'

const CACHE_TTL_MS = 60 * 1000
let cachedData: { value: DashboardData; expiresAt: number } | null = null
let inFlight: Promise<DashboardData> | null = null

async function getCachedContentData(force: boolean) {
  const now = Date.now()

  if (!force && cachedData && cachedData.expiresAt > now) {
    return cachedData.value
  }

  if (!force && inFlight) {
    return inFlight
  }

  inFlight = fetchContentData()

  try {
    const data = await inFlight
    cachedData = { value: data, expiresAt: now + CACHE_TTL_MS }
    return data
  } finally {
    inFlight = null
  }
}

export async function GET(request: Request) {
  const adminUser = await getAdminSessionUser()

  if (!adminUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const force = url.searchParams.get('force') === '1'

  try {
    const data = await getCachedContentData(force)
    return NextResponse.json(data)
  } catch (error) {
    console.error('[api/admin/content-data] failed to load data', error)
    return NextResponse.json({ error: 'Failed to load admin content data' }, { status: 500 })
  }
}
