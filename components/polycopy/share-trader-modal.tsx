'use client'

import React, { useState, useCallback, useEffect, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Copy, Share2, Download, Check, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toPng } from 'html-to-image'
import { TraderCard, type CardTheme } from '@/components/polycopy/trader-card'
import { useTraderCardData } from '@/hooks/useTraderCardData'
import type { TimePeriod } from '@/lib/time-period-utils'

interface ShareTraderModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  walletAddress: string
}

type Theme = CardTheme

// Add toast animations
if (typeof document !== 'undefined' && !document.getElementById('toast-animations')) {
  const style = document.createElement('style')
  style.id = 'toast-animations'
  style.textContent = `
    @keyframes slideIn {
      from {
        transform: translateX(400px);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
    @keyframes slideOut {
      from {
        transform: translateX(0);
        opacity: 1;
      }
      to {
        transform: translateX(400px);
        opacity: 0;
      }
    }
  `
  document.head.appendChild(style)
}

export function ShareTraderModal({
  open,
  onOpenChange,
  walletAddress,
}: ShareTraderModalProps) {
  const [selectedTheme, setSelectedTheme] = useState<Theme>('cream')
  const [selectedTimePeriod, setSelectedTimePeriod] = useState<TimePeriod>('ALL')
  const [isGenerating, setIsGenerating] = useState(false)
  const [copied, setCopied] = useState(false)
  const [imageBlobs, setImageBlobs] = useState<Record<Theme, Blob | null>>({
    cream: null,
    dark: null,
    profit: null,
    fire: null,
  })
  const cardRefs = useRef<Record<Theme, HTMLDivElement | null>>({
    cream: null,
    dark: null,
    profit: null,
    fire: null,
  })

  // Fetch trader data for selected time period
  const { data: traderData, isLoading: isLoadingData, error } = useTraderCardData(
    walletAddress,
    selectedTimePeriod
  )

  // Helper to wait for images to load
  const waitForImagesToLoad = useCallback(async (element: HTMLElement) => {
    const images = element.querySelectorAll('img')
    const imagePromises = Array.from(images).map(img => {
      if (img.complete) return Promise.resolve()
      return new Promise((resolve) => {
        img.onload = resolve
        img.onerror = resolve
        // Timeout after 5 seconds
        setTimeout(() => resolve(null), 5000)
      })
    })
    await Promise.all(imagePromises)
  }, [])

  // Generate image from the React component using html-to-image
  const generateImage = useCallback(async (theme: Theme): Promise<Blob> => {
    const cardRef = cardRefs.current[theme]
    if (!cardRef) {
      throw new Error('Card ref not available')
    }

    try {
      console.log(`Starting image generation for ${theme} theme...`)
      
      // Wait for all images to load
      await waitForImagesToLoad(cardRef)
      
      const dataUrl = await toPng(cardRef, {
        quality: 1,
        pixelRatio: 2, // 2x for high quality
        cacheBust: true,
      })
      
      // Convert data URL to blob
      const base64Data = dataUrl.split(',')[1]
      const byteCharacters = atob(base64Data)
      const byteNumbers = new Array(byteCharacters.length)
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i)
      }
      const byteArray = new Uint8Array(byteNumbers)
      const blob = new Blob([byteArray], { type: 'image/png' })
      console.log('Blob created:', blob.type, blob.size)
      return blob
    } catch (error) {
      console.error('Error in generateImage:', error)
      throw error
    }
  }, [waitForImagesToLoad])

  // Generate all theme images when data is available
  useEffect(() => {
    if (!open || !traderData || isLoadingData) {
      return
    }

    const generateAllThemes = async () => {
      setIsGenerating(true)
      try {
        // Wait for all card refs to be available
        let attempts = 0
        while (attempts < 20) {
          const allRefsAvailable = Object.values(cardRefs.current).every(ref => ref !== null)
          if (allRefsAvailable) break
          await new Promise(resolve => setTimeout(resolve, 50))
          attempts++
        }

        const allRefsAvailable = Object.values(cardRefs.current).every(ref => ref !== null)
        if (!allRefsAvailable) {
          console.error('Not all card refs available after waiting')
          return
        }

        // Wait for images to load
        await new Promise(resolve => setTimeout(resolve, 500))
        
        // Generate all themes in parallel
        console.log('Generating all themes...')
        const themeKeys: Theme[] = ['cream', 'dark', 'profit', 'fire']
        const blobs = await Promise.all(
          themeKeys.map(theme => generateImage(theme))
        )

        // Update state with all blobs
        const newImageBlobs: Record<Theme, Blob | null> = {
          cream: blobs[0],
          dark: blobs[1],
          profit: blobs[2],
          fire: blobs[3],
        }
        setImageBlobs(newImageBlobs)
        console.log('All themes generated successfully')
      } catch (error) {
        console.error('Failed to generate images:', error)
        alert(`Failed to generate cards: ${error instanceof Error ? error.message : 'Unknown error'}`)
      } finally {
        setIsGenerating(false)
      }
    }

    generateAllThemes()
  }, [open, traderData, isLoadingData, generateImage])

  // Handle theme change
  const handleThemeChange = (theme: Theme) => {
    setSelectedTheme(theme)
  }

  // Handle time period change
  const handleTimePeriodChange = (period: TimePeriod) => {
    setSelectedTimePeriod(period)
    // Reset image blobs to trigger regeneration
    setImageBlobs({
      cream: null,
      dark: null,
      profit: null,
      fire: null,
    })
  }

  // Helper function to show toast notifications
  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success', duration = 6000) => {
    const colors = {
      success: '#1DA1F2',
      error: '#EF4444',
      info: '#8B5CF6'
    }
    
    const icons = {
      success: '📥',
      error: '⚠️',
      info: 'ℹ️'
    }
    
    const toast = document.createElement('div')
    toast.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: ${colors[type]};
      color: white;
      padding: 16px 24px;
      border-radius: 12px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 9999;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 14px;
      font-weight: 500;
      max-width: 340px;
      animation: slideIn 0.3s ease-out;
      cursor: pointer;
    `
    toast.innerHTML = `
      <div style="display: flex; align-items: start; gap: 12px;">
        <div style="font-size: 20px;">${icons[type]}</div>
        <div style="flex: 1;">${message}</div>
        <div style="opacity: 0.7; font-size: 18px; margin-left: 8px;">×</div>
      </div>
    `
    
    // Click to dismiss
    toast.onclick = () => {
      toast.style.animation = 'slideOut 0.3s ease-out'
      setTimeout(() => toast.remove(), 300)
    }
    
    document.body.appendChild(toast)
    
    // Auto-dismiss
    setTimeout(() => {
      if (toast.parentNode) {
        toast.style.animation = 'slideOut 0.3s ease-out'
        setTimeout(() => toast.remove(), 300)
      }
    }, duration)
  }, [])

  const handleCopyImage = useCallback(async () => {
    try {
      const blob = imageBlobs[selectedTheme]
      if (!blob) {
        throw new Error('No image available')
      }
      
      await navigator.clipboard.write([
        new ClipboardItem({
          [blob.type]: blob,
        }),
      ])
      
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      
      showToast(
        `<div style="font-weight: 600; margin-bottom: 4px;">Image Copied!</div>
        <div style="font-size: 13px; opacity: 0.95;">
          Paste it anywhere with Cmd+V (Mac) or Ctrl+V (Windows)
        </div>`,
        'success',
        3000
      )
    } catch (error) {
      console.error('Failed to copy image:', error)
      showToast(
        `<div style="font-weight: 600; margin-bottom: 4px;">Copy Failed</div>
        <div style="font-size: 13px; opacity: 0.95;">
          Please try the Download button instead.
        </div>`,
        'error',
        4000
      )
    }
  }, [imageBlobs, selectedTheme, showToast])

  const handleDownload = useCallback(async () => {
    try {
      const blob = imageBlobs[selectedTheme]
      if (!blob) {
        throw new Error('No image available')
      }
      
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `polycopy-trader-${walletAddress}-${selectedTheme}.png`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
      
      showToast(
        `<div style="font-weight: 600; margin-bottom: 4px;">Image Downloaded!</div>
        <div style="font-size: 13px; opacity: 0.95;">
          Check your Downloads folder
        </div>`,
        'success',
        3000
      )
    } catch (error) {
      console.error('Failed to download image:', error)
      showToast(
        `<div style="font-weight: 600; margin-bottom: 4px;">Download Failed</div>
        <div style="font-size: 13px; opacity: 0.95;">
          ${error instanceof Error ? error.message : 'Unknown error'}
        </div>`,
        'error',
        4000
      )
    }
  }, [imageBlobs, selectedTheme, walletAddress, showToast])

  const handleShareToX = useCallback(async () => {
    try {
      const blob = imageBlobs[selectedTheme]
      if (!blob || !traderData) {
        throw new Error('No image or data available')
      }

      const traderUrl = `${window.location.origin}/trader/${walletAddress}`
      
      // Format P&L value for better display
      const formatPnL = (val: number) => {
        const absVal = Math.abs(val)
        if (absVal >= 1000) {
          return `${val >= 0 ? '+' : '-'}$${(absVal / 1000).toFixed(1)}K`
        }
        return `${val >= 0 ? '+' : ''}$${val.toFixed(0)}`
      }
      
      const shareText = `Check out ${traderData.displayName}'s performance on Polycopy! 📊

${formatPnL(traderData.totalPnL)} P&L | ${traderData.roi >= 0 ? '+' : ''}${traderData.roi.toFixed(1)}% ROI | ${traderData.winRate.toFixed(1)}% Win Rate

${traderUrl}`
      
      console.log('Share to X initiated')
      
      // Detect if we're on a mobile device (not just mobile browser width)
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
      
      // Only try Web Share API on actual mobile devices, not desktop browsers
      if (isMobile && navigator.share && navigator.canShare) {
        try {
          const file = new File([blob], `polycopy-trader-${walletAddress}.png`, { type: 'image/png' })
          const canShare = navigator.canShare({ files: [file] })
          
          if (canShare) {
            console.log('Using Web Share API (mobile device)')
            await navigator.share({
              text: shareText,
              files: [file],
            })
            return
          }
        } catch (shareError) {
          console.log('Web Share API failed, using fallback')
        }
      }
      
      // Desktop flow: Download the image first, then open Twitter
      console.log('Using desktop flow: download + Twitter intent')
      
      // Download the image
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `polycopy-trader-${walletAddress}-${selectedTheme}.png`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
      
      // Small delay to ensure download starts
      await new Promise(resolve => setTimeout(resolve, 300))
      
      // Open Twitter intent URL
      const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`
      
      console.log('Opening Twitter')
      
      // Try to open Twitter in new window
      const twitterWindow = window.open(twitterUrl, '_blank', 'width=550,height=420,noopener,noreferrer')
      
      // Close modal first so user can see everything
      onOpenChange(false)
      
      // Small delay to let modal close animation complete
      await new Promise(resolve => setTimeout(resolve, 200))
      
      // Check if popup was blocked
      if (!twitterWindow || twitterWindow.closed || typeof twitterWindow.closed === 'undefined') {
        console.warn('Popup was blocked - copying text and showing instructions')
        
        // Copy tweet text to clipboard as fallback
        try {
          await navigator.clipboard.writeText(shareText)
          
          showToast(
            `<div style="font-weight: 600; margin-bottom: 6px;">Image Downloaded & Text Copied!</div>
            <div style="font-size: 13px; opacity: 0.95; line-height: 1.4;">
              Your popup blocker prevented opening Twitter.<br>
              <strong>Next steps:</strong><br>
              1. Open Twitter manually<br>
              2. Paste the tweet text (Cmd+V)<br>
              3. Attach the downloaded image
            </div>`,
            'info',
            8000
          )
        } catch (clipboardError) {
          showToast(
            `<div style="font-weight: 600; margin-bottom: 6px;">Image Downloaded!</div>
            <div style="font-size: 13px; opacity: 0.95;">
              Popup blocker prevented opening Twitter. Please open Twitter manually and attach the image from your Downloads folder.
            </div>`,
            'info',
            7000
          )
        }
      } else {
        // Success - Twitter opened in new window
        showToast(
          `<div style="font-weight: 600; margin-bottom: 6px;">Image Downloaded!</div>
          <div style="font-size: 13px; opacity: 0.95; line-height: 1.4;">
            Check your Downloads folder, then attach it to your tweet on Twitter.
          </div>`,
          'success',
          6000
        )
      }
    } catch (error) {
      console.error('Failed to share to X:', error)
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      
      showToast(
        `<div style="font-weight: 600; margin-bottom: 6px;">Share Failed</div>
        <div style="font-size: 13px; opacity: 0.95;">
          ${errorMsg}<br>Please try the Download button instead.
        </div>`,
        'error',
        5000
      )
    }
  }, [imageBlobs, selectedTheme, traderData, walletAddress, onOpenChange, showToast])

  const themes: Array<{ value: Theme; label: string; gradient: string }> = [
    { value: 'cream', label: 'Cream', gradient: 'linear-gradient(135deg, #F5F1E8 0%, #E8DCC8 100%)' },
    { value: 'dark', label: 'Dark', gradient: 'linear-gradient(135deg, #2D3748 0%, #1A202C 100%)' },
    { value: 'profit', label: 'Profit', gradient: 'linear-gradient(135deg, #E8F5E9 0%, #C8E6C9 100%)' },
    { value: 'fire', label: 'Fire', gradient: 'linear-gradient(135deg, #FFE5D9 0%, #FFB199 100%)' },
  ]

  const timePeriods: Array<{ value: TimePeriod; label: string }> = [
    { value: '1D', label: '24H' },
    { value: '7D', label: '7D' },
    { value: '30D', label: '30D' },
    { value: '3M', label: '3M' },
    { value: '6M', label: '6M' },
    { value: 'ALL', label: 'ALL' },
  ]

  const isLoading = isLoadingData || isGenerating

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Share Player Card</DialogTitle>
          <DialogDescription>
            Choose a time period and theme to share this trader's performance.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pb-4">
          {/* Time Period Selector */}
          <div className="space-y-3">
            <label className="text-sm font-semibold text-slate-900">Time Period</label>
            <div className="grid grid-cols-6 gap-2">
              {timePeriods.map((period) => (
                <button
                  key={period.value}
                  onClick={() => handleTimePeriodChange(period.value)}
                  disabled={isLoading}
                  className={cn(
                    'py-2 px-3 rounded-lg border-2 transition-all text-sm font-medium',
                    selectedTimePeriod === period.value
                      ? 'border-yellow-500 bg-yellow-50 text-yellow-900'
                      : 'border-slate-200 hover:border-slate-300 text-slate-700',
                    isLoading && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  {period.label}
                </button>
              ))}
            </div>
          </div>

          {/* Theme Selector */}
          <div className="space-y-3">
            <label className="text-sm font-semibold text-slate-900">Theme</label>
            <div className="grid grid-cols-4 gap-3">
              {themes.map((theme) => (
                <button
                  key={theme.value}
                  onClick={() => handleThemeChange(theme.value)}
                  disabled={isLoading}
                  className={cn(
                    'relative h-20 rounded-lg border-2 transition-all overflow-hidden',
                    selectedTheme === theme.value
                      ? 'border-yellow-500 ring-2 ring-yellow-500 ring-offset-2'
                      : 'border-slate-200 hover:border-slate-300',
                    isLoading && 'opacity-50 cursor-not-allowed'
                  )}
                  style={{ background: theme.gradient }}
                >
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-xs font-semibold text-slate-900 bg-white/80 px-2 py-1 rounded">
                      {theme.label}
                    </span>
                  </div>
                  {selectedTheme === theme.value && (
                    <div className="absolute top-2 right-2 bg-yellow-500 rounded-full p-1">
                      <Check className="h-3 w-3 text-white" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Hidden card components for rendering all themes */}
          {traderData && (
            <div style={{ 
              position: 'absolute', 
              opacity: 0, 
              pointerEvents: 'none',
              width: '420px',
              zIndex: -1,
              display: 'flex',
              flexDirection: 'column',
              gap: '20px'
            }}>
              {(['cream', 'dark', 'profit', 'fire'] as Theme[]).map((theme) => (
                <div key={theme} ref={(el) => { cardRefs.current[theme] = el }}>
                  <TraderCard
                    {...traderData}
                    theme={theme}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Preview */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-900">Preview</label>
            <div className="relative w-full max-w-[340px] mx-auto bg-slate-100 rounded-lg overflow-hidden border border-slate-200" style={{ aspectRatio: '420/640' }}>
              {isLoading || !imageBlobs[selectedTheme] ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4">
                  <Loader2 className="h-8 w-8 animate-spin text-yellow-500" />
                  <div className="text-center">
                    <p className="text-xs text-slate-600 font-medium">
                      {isLoadingData ? 'Loading trader data...' : 'Generating cards...'}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      This may take a moment.
                    </p>
                  </div>
                </div>
              ) : (
                <img
                  src={URL.createObjectURL(imageBlobs[selectedTheme])}
                  alt="Trader Player Card"
                  className="w-full h-full object-contain"
                />
              )}
            </div>
            {imageBlobs[selectedTheme] && !isLoading && (
              <p className="text-xs text-slate-500 text-center">
                High-resolution card ready to share
              </p>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              onClick={handleCopyImage}
              disabled={!imageBlobs[selectedTheme] || isLoading}
              variant="outline"
              className="flex-1"
              size="sm"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-2" />
                  Copy
                </>
              )}
            </Button>
            <Button
              onClick={handleDownload}
              disabled={!imageBlobs[selectedTheme] || isLoading}
              variant="outline"
              className="flex-1"
              size="sm"
            >
              <Download className="h-4 w-4 mr-2" />
              Download
            </Button>
            <Button
              onClick={handleShareToX}
              disabled={!imageBlobs[selectedTheme] || isLoading}
              className="flex-1 bg-black hover:bg-slate-800 text-white"
              size="sm"
            >
              <Share2 className="h-4 w-4 mr-2" />
              Share to X
            </Button>
          </div>

          <p className="text-xs text-slate-500 text-center">
            Copy and paste directly into Twitter, Instagram, or LinkedIn
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
