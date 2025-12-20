import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const DEV_PASSWORD_SETUP_SECRET = process.env.DEV_PASSWORD_SETUP_SECRET
const DEV_PASSWORD_LOGIN_ENABLED = process.env.NEXT_PUBLIC_DEV_PASSWORD_LOGIN === 'true'

export async function POST(request: NextRequest) {
  if (!DEV_PASSWORD_LOGIN_ENABLED) {
    return NextResponse.json({ error: 'Not enabled' }, { status: 404 })
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !DEV_PASSWORD_SETUP_SECRET) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 })
  }

  const { email, password, code } = await request.json()

  if (!email || !password || !code) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  if (code !== DEV_PASSWORD_SETUP_SECRET) {
    return NextResponse.json({ error: 'Invalid access code' }, { status: 401 })
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  let existingUser = null
  let page = 1
  const perPage = 1000

  while (!existingUser) {
    const { data: userLookup, error: lookupError } = await admin.auth.admin.listUsers({
      page,
      perPage,
    })

    if (lookupError) {
      return NextResponse.json({ error: lookupError.message }, { status: 400 })
    }

    const users = userLookup?.users || []
    existingUser = users.find((user) => user.email?.toLowerCase() === email.toLowerCase()) || null

    if (users.length < perPage) {
      break
    }

    page += 1
  }

  if (existingUser) {
    const { error: updateError } = await admin.auth.admin.updateUserById(existingUser.id, {
      password,
      email_confirm: true,
    })

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true, status: 'updated' })
  }

  const { error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (createError) {
    return NextResponse.json({ error: createError.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true, status: 'created' })
}
