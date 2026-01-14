import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import type { User } from '@supabase/supabase-js'

const createService = () =>
  createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  )

export function createAdminServiceClient() {
  return createService()
}

export async function getAdminSessionUser(): Promise<User | null> {
  const supabaseAuth = await createAuthClient()
  const {
    data: { user },
    error
  } = await supabaseAuth.auth.getUser()

  if (error || !user) {
    return null
  }

  const { data: profile, error: profileError } = await supabaseAuth
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError || !profile?.is_admin) {
    return null
  }

  return user
}
