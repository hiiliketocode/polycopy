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
        console.error('No session found for upgrade')
        alert('Please log in to upgrade')
        return
      }

      console.log('Starting checkout session...')
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        credentials: 'include', // Include cookies in request
      })
      
      console.log('Checkout response status:', response.status)
      const data = await response.json()
      console.log('Checkout response data:', data)
      
      if (!response.ok) {
        throw new Error(data.error || data.details || 'Failed to create checkout session')
      }
      
      if (data.error) {
        throw new Error(data.error)
      }
      
      if (data.url) {
        console.log('Redirecting to Stripe checkout...')
        window.location.href = data.url
      } else {
        throw new Error('No checkout URL returned')
      }
    } catch (error) {
      console.error('Upgrade error:', error)
      alert(`Failed to start checkout: ${error instanceof Error ? error.message : 'Please try again.'}`)
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
