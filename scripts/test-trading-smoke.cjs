#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */

const path = require('path')
const dotenvPath = path.join(process.cwd(), '.env.local')
require('dotenv').config({ path: dotenvPath })

async function call(url, opts) {
  const resp = await fetch(url, opts)
  const json = await resp.json().catch(() => ({}))
  console.log(`\n${url} -> ${resp.status}`)
  console.log(json)
  return { status: resp.status, json }
}

async function main() {
  await call('http://localhost:3000/api/polymarket/auth-check')
  await call('http://localhost:3000/api/polymarket/orders/open')
  await call('http://localhost:3000/api/polymarket/positions')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
