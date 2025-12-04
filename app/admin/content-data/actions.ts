'use server'

import { cookies } from 'next/headers'

const COOKIE_NAME = 'admin_dashboard_auth'

export async function verifyPassword(password: string) {
  const correctPassword = process.env.ADMIN_DASHBOARD_PASSWORD
  
  if (!correctPassword) {
    console.error('ADMIN_DASHBOARD_PASSWORD environment variable not set')
    return { success: false, error: 'Server configuration error' }
  }
  
  if (password === correctPassword) {
    const cookieStore = await cookies()
    cookieStore.set(COOKIE_NAME, 'authenticated', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 86400, // 24 hours
      sameSite: 'strict',
      path: '/'
    })
    return { success: true }
  }
  
  return { success: false, error: 'Invalid password' }
}

export async function checkAuth() {
  const cookieStore = await cookies()
  const authCookie = cookieStore.get(COOKIE_NAME)
  return authCookie?.value === 'authenticated'
}

export async function logout() {
  const cookieStore = await cookies()
  cookieStore.delete(COOKIE_NAME)
  return { success: true }
}

