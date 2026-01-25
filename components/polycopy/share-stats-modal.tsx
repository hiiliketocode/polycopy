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
import { PortfolioCard, type CardTheme } from '@/components/polycopy/portfolio-card'

interface ShareStatsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  username: string
  stats: {
    pnl: number
    roi: number
    winRate: number
    volume: number
    trades: number
    followers: number
    memberSince: string
  }
}

type Theme = CardTheme

export function ShareStatsModal({
  open,
  onOpenChange,
  username,
  stats,
}: ShareStatsModalProps) {
  const [selectedTheme, setSelectedTheme] = useState<Theme>('cream')
  const [isLoading, setIsLoading] = useState(false)
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

  // Helper to wait for images to load
  const waitForImagesToLoad = useCallback(async (element: HTMLElement) => {
    const images = element.querySelectorAll('img')
    const imagePromises = Array.from(images).map(img => {
      if (img.complete) return Promise.resolve()
      return new Promise((resolve, reject) => {
        img.onload = resolve
        img.onerror = reject
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
      
      // Log the actual dimensions
      const rect = cardRef.getBoundingClientRect()
      console.log('Card dimensions:', {
        width: rect.width,
        height: rect.height,
        scrollHeight: cardRef.scrollHeight,
        scrollWidth: cardRef.scrollWidth
      })
      
      // Wait for all images to load
      console.log('Waiting for images to load...')
      await waitForImagesToLoad(cardRef)
      console.log('Images loaded')
      
      const dataUrl = await toPng(cardRef, {
        quality: 1,
        pixelRatio: 2, // 2x for high quality
        cacheBust: true, // Prevent caching issues
      })
      
      console.log('toPng completed, converting to blob...')
      // Convert data URL to blob without using fetch (to avoid CSP issues)
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

  // Generate image when theme changes
  // Generate all theme images when modal opens
  useEffect(() => {
    if (!open) {
      setImageBlobs({
        cream: null,
        dark: null,
        profit: null,
        fire: null,
      })
      return
    }

    const generateAllThemes = async () => {
      setIsLoading(true)
      try {
        // Wait for all card refs to be available
        let attempts = 0
        while (attempts < 20) {
          const allRefsAvailable = Object.values(cardRefs.current).every(ref => ref !== null)
          if (allRefsAvailable) break
          await new Promise(resolve => setTimeout(resolve, 50))
          attempts++
        }

        // Check if all refs are available
        const allRefsAvailable = Object.values(cardRefs.current).every(ref => ref !== null)
        if (!allRefsAvailable) {
          console.error('Not all card refs available after waiting')
          alert('Failed to generate card preview. Please try refreshing the page.')
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
        setIsLoading(false)
      }
    }

    generateAllThemes()
  }, [open, generateImage])

  // Handle theme change
  const handleThemeChange = (theme: Theme) => {
    setSelectedTheme(theme)
  }

  const handleCopyImage = async () => {
    try {
      const blob = imageBlobs[selectedTheme]
      if (!blob) {
        throw new Error('No image available')
      }
      
      // Copy to clipboard using Clipboard API
      await navigator.clipboard.write([
        new ClipboardItem({
          [blob.type]: blob,
        }),
      ])
      
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error('Failed to copy image:', error)
      alert('Failed to copy image. Please try downloading instead.')
    }
  }

  const handleDownload = async () => {
    try {
      const blob = imageBlobs[selectedTheme]
      if (!blob) {
        throw new Error('No image available')
      }
      
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `polycopy-stats-${username}-${selectedTheme}.png`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Failed to download image:', error)
      alert('Failed to download image')
    }
  }

  const handleShareToX = async () => {
    try {
      const blob = imageBlobs[selectedTheme]
      if (!blob) {
        throw new Error('No image available')
      }

      const portfolioUrl = 'https://polycopy.app/portfolio'
      const shareText = `Check out my Polycopy stats! 📊\n\n${stats.pnl >= 0 ? '+' : ''}$${stats.pnl.toFixed(2)} P&L | ${stats.roi >= 0 ? '+' : ''}${stats.roi.toFixed(1)}% ROI\n\nCopy the best traders on Polymarket 👇\nPortfolio: ${portfolioUrl}`
      
      // Try to use Web Share API if available (works on mobile and some browsers)
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [new File([blob], 'polycopy-stats.png', { type: 'image/png' })] })) {
        const file = new File([blob], `polycopy-stats-${username}.png`, { type: 'image/png' })
        const text = shareText
        
        await navigator.share({
          text,
          files: [file],
        })
      } else {
        // Fallback: Download the image and open Twitter
        const url = window.URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `polycopy-stats-${username}-${selectedTheme}.png`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        window.URL.revokeObjectURL(url)
        
        // Open Twitter with text only
        const text = shareText
        const tweetUrl = portfolioUrl
        const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(tweetUrl)}`
        
        // Show alert with instructions
        alert('Image downloaded! Please attach it to your tweet manually.')
        window.open(twitterUrl, '_blank', 'width=550,height=420')
      }
    } catch (error) {
      console.error('Failed to share to X:', error)
      alert('Failed to prepare image for sharing')
    }
  }

  const themes: Array<{ value: Theme; label: string; gradient: string }> = [
    { value: 'cream', label: 'Cream', gradient: 'linear-gradient(135deg, #F5F1E8 0%, #E8DCC8 100%)' },
    { value: 'dark', label: 'Dark', gradient: 'linear-gradient(135deg, #2D3748 0%, #1A202C 100%)' },
    { value: 'profit', label: 'Profit', gradient: 'linear-gradient(135deg, #E8F5E9 0%, #C8E6C9 100%)' },
    { value: 'fire', label: 'Fire', gradient: 'linear-gradient(135deg, #FFE5D9 0%, #FFB199 100%)' },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Share Your Stats</DialogTitle>
          <DialogDescription>
            Choose a theme and share your Polycopy performance.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pb-4">
          {/* Theme Selector */}
          <div className="space-y-3">
            <label className="text-sm font-semibold text-slate-900">Choose Theme</label>
            <div className="grid grid-cols-4 gap-3">
              {themes.map((theme) => (
                <button
                  key={theme.value}
                  onClick={() => handleThemeChange(theme.value)}
                  className={cn(
                    'relative h-20 rounded-lg border-2 transition-all overflow-hidden',
                    selectedTheme === theme.value
                      ? 'border-yellow-500 ring-2 ring-yellow-500 ring-offset-2'
                      : 'border-slate-200 hover:border-slate-300'
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
                <PortfolioCard
                  username={username}
                  memberSince={stats.memberSince}
                  totalPnL={stats.pnl}
                  roi={stats.roi}
                  winRate={stats.winRate}
                  totalVolume={stats.volume}
                  numberOfTrades={stats.trades}
                  followingCount={stats.followers}
                  theme={theme}
                />
              </div>
            ))}
          </div>

          {/* Preview */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-900">Preview</label>
            <div className="relative w-full max-w-[340px] mx-auto bg-slate-100 rounded-lg overflow-hidden border border-slate-200" style={{ aspectRatio: '420/560' }}>
              {isLoading || !imageBlobs[selectedTheme] ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4">
                  <Loader2 className="h-8 w-8 animate-spin text-yellow-500" />
                  <div className="text-center">
                    <p className="text-xs text-slate-600 font-medium">
                      Generating your cards...
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      This may take up to 1 minute.
                    </p>
                  </div>
                </div>
              ) : (
                <img
                  src={URL.createObjectURL(imageBlobs[selectedTheme])}
                  alt="Portfolio Stats Card"
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
