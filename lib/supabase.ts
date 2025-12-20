import { createBrowserClient } from '@supabase/ssr'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey)

export async function ensureProfile(userId: string, email: string) {
  try {
    // Use upsert to insert or update - this handles if profile already exists
    const { error } = await supabase
      .from('profiles')
      .upsert(
        { id: userId, email: email },
        { onConflict: 'id', ignoreDuplicates: false }
      )
    
    if (error) {
      console.error('Error ensuring profile:', error)
      throw error
    }
  } catch (err) {
    console.error('Exception in ensureProfile:', err)
    throw err
  }
}
