import { createClient } from '@/lib/supabase/server'

export async function verifyAdminAuth(): Promise<{ isAdmin: boolean; userId?: string; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return { isAdmin: false, error: 'Not authenticated' }
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return { isAdmin: false, error: 'Profile not found' }
    }

    if (!profile.is_admin) {
      return { isAdmin: false, userId: user.id, error: 'Admin access required' }
    }

    return { isAdmin: true, userId: user.id }
  } catch (error) {
    return { isAdmin: false, error: 'Authentication failed' }
  }
}
