#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */

const path = require('path')
const dotenvPath = path.join(process.cwd(), '.env.local')
require('dotenv').config({ path: dotenvPath })

async function main() {
  const url = 'http://localhost:3000/api/polymarket/auth-check'
  const resp = await fetch(url)
  const json = await resp.json()
  console.log('Auth Check Status:', resp.status)
  console.log('Auth Check Response:', json)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
