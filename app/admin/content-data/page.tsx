import AdminDashboardClient from './AdminDashboardClient'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { fetchContentData } from './data'

export const dynamic = 'force-dynamic'
export const revalidate = 0

async function getAdminSession() {
  const supabase = await createServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return null
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError || !profile?.is_admin) {
    return null
  }

  return user
}

export default async function AdminContentDataPage() {
  const adminUser = await getAdminSession()

  if (!adminUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#05070E] text-white">
        <p className="max-w-md text-center text-lg">
          Access denied. Please log in with an admin account to view this dashboard.
        </p>
      </div>
    )
  }

  const data = await fetchContentData()

  return <AdminDashboardClient data={data} />
}
