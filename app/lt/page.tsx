import { redirect } from 'next/navigation'

/**
 * LT (Live Trading) - Admin-only live trading console.
 * Redirects to the underlying admin auto-copy console.
 */
export default function LTPage() {
  redirect('/admin/auto-copy')
}
