"use client"

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { X } from 'lucide-react'

interface SignupBannerProps {
  isLoggedIn: boolean
}

export function SignupBanner({ isLoggedIn }: SignupBannerProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)

  useEffect(() => {
    // Only show for non-logged-in users
    if (isLoggedIn) {
      setIsVisible(false)
      return
    }

    // Check if user has dismissed the banner
    const dismissedUntil = localStorage.getItem('signup-banner-dismissed')
    if (dismissedUntil) {
      const dismissedDate = new Date(dismissedUntil)
      const now = new Date()
      if (now < dismissedDate) {
        setIsVisible(false)
        return
      }
    }

    // Show banner with animation
    setIsVisible(true)
    setTimeout(() => setIsAnimating(true), 100)
  }, [isLoggedIn])

  const handleDismiss = () => {
    setIsAnimating(false)
    setTimeout(() => {
      setIsVisible(false)
      // Store dismissal for 7 days
      const dismissUntil = new Date()
      dismissUntil.setDate(dismissUntil.getDate() + 7)
      localStorage.setItem('signup-banner-dismissed', dismissUntil.toISOString())
    }, 300)
  }

  if (!isVisible) return null

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-40 bg-[#FDB022] shadow-sm transition-all duration-300 ${
        isAnimating ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0'
      }`}
      style={{ marginTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-center gap-4">
        <div className="flex items-center gap-2 text-sm md:text-base text-slate-900">
          <span className="text-lg">📊</span>
          <p className="font-medium">
            Follow top traders & copy their predictions •{' '}
            <Link
              href="/login?mode=signup"
              className="text-[#1E293B] underline decoration-[#1E293B] decoration-2 underline-offset-2 hover:decoration-slate-700 transition-colors font-semibold"
            >
              Sign up free
            </Link>
          </p>
        </div>

        <button
          onClick={handleDismiss}
          className="flex-shrink-0 p-1.5 rounded-md hover:bg-yellow-500 transition-colors text-slate-700 hover:text-slate-900"
          aria-label="Dismiss banner"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

