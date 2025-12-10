'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export function useUpgrade() {
  const [loading, setLoading] = useState(false)

  const upgrade = async () => {
    setLoading(true)
    try {
      // Get the current session to pass auth token
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        alert('Please log in to upgrade')
        return
      }

      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        credentials: 'include', // Include cookies in request
      })
      const { url, error } = await response.json()
      
      if (error) throw new Error(error)
      if (url) window.location.href = url
    } catch (error) {
      console.error('Upgrade error:', error)
      alert('Failed to start checkout. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const manageSubscription = async () => {
    setLoading(true)
    try {
      // Get the current session to pass auth token
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        alert('Please log in to manage subscription')
        return
      }

      const response = await fetch('/api/stripe/portal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        credentials: 'include', // Include cookies in request
      })
      const { url, error } = await response.json()
      
      if (error) throw new Error(error)
      if (url) window.location.href = url
    } catch (error) {
      console.error('Portal error:', error)
      alert('Failed to open billing portal. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return { upgrade, manageSubscription, loading }
}
