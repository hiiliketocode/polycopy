#!/usr/bin/env node

const baseUrl = process.env.BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
const cronSecret = process.env.CRON_SECRET

const limit = Math.min(500, Math.max(50, Number(process.env.LIMIT || 200)))
const maxPages = Math.max(1, Number(process.env.MAX_PAGES || 100))
const sleepMs = Math.max(0, Number(process.env.SLEEP_MS || 250))

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function run() {
  let page = 1
  let totalUpdated = 0

  while (page <= maxPages) {
    const url = new URL('/api/cron/refresh-copy-pnl', baseUrl)
    url.searchParams.set('mode', 'backfill')
    url.searchParams.set('limit', String(limit))
    url.searchParams.set('page', String(page))

    const headers = cronSecret ? { 'x-cron-secret': cronSecret } : undefined
    const res = await fetch(url.toString(), { headers })

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Request failed (page ${page}): ${res.status} ${body}`)
    }

    const data = await res.json()
    const updated = Number(data.updated || 0)
    const marketsFetched = Number(data.marketsFetched || 0)

    console.log(
      `[backfill] page=${page} updated=${updated} marketsFetched=${marketsFetched} totalUpdated=${totalUpdated + updated}`
    )

    totalUpdated += updated

    if (updated === 0) {
      break
    }

    page += 1
    if (sleepMs > 0) {
      await sleep(sleepMs)
    }
  }

  console.log(`[backfill] done. totalUpdated=${totalUpdated}`)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
