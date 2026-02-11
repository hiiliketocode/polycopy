'use client'

import * as React from 'react'
import * as AvatarPrimitive from '@radix-ui/react-avatar'
import { cn } from '@/lib/utils'

// Avatar fallback: initials (FaceHash optional - removed to avoid build issues)
function getInitials(name: string | null | undefined): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

/**
 * PolycopyAvatar Component
 * 
 * A branded avatar component for Polycopy that uses FaceHashes for missing profile pictures.
 * Integrates with Radix UI Avatar primitives and Polycopy's brand colors.
 * 
 * Features:
 * - Displays profile image when available
 * - Falls back to unique FaceHash avatar when no image exists
 * - Uses Polycopy brand colors (yellow/amber palette)
 * - Maintains consistency with Polycopy's design system
 */

interface PolycopyAvatarProps extends React.ComponentProps<typeof AvatarPrimitive.Root> {
  /** Profile image URL (from Polymarket or user upload) */
  src?: string | null
  /** Display name or wallet address - used to generate unique FaceHash */
  name?: string | null
  /** Alt text for the image */
  alt?: string
  /** Avatar size in pixels (default: 40) */
  size?: number
  /** Show border ring (default: true) */
  showRing?: boolean
  /** Custom ring color (default: slate-200) */
  ringColor?: string
}

/**
 * Main Polycopy Avatar Component
 * Automatically handles image loading, errors, and fallback to FaceHash
 */
function PolycopyAvatar({
  src,
  name,
  alt,
  size = 40,
  showRing = true,
  ringColor = 'ring-slate-100',
  className,
  ...props
}: PolycopyAvatarProps) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      className={cn(
        'relative flex shrink-0 overflow-hidden rounded-full',
        showRing && `ring-2 ${ringColor}`,
        className,
      )}
      style={{ width: size, height: size }}
      {...props}
    >
      {/* Profile image if available */}
      {src && (
        <AvatarPrimitive.Image
          data-slot="avatar-image"
          src={src}
          alt={alt || name || 'Profile'}
          className="aspect-square size-full object-cover"
        />
      )}
      
      {/* Initials fallback */}
      <AvatarPrimitive.Fallback
        data-slot="avatar-fallback"
        className="flex size-full items-center justify-center rounded-full overflow-hidden bg-amber-100 text-amber-800 font-medium"
      >
        <span style={{ fontSize: size * 0.4 }}>{getInitials(name)}</span>
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  )
}

/**
 * Trader Avatar Variant
 * Optimized for trader profiles with wallet-based color generation
 */
interface TraderAvatarProps extends Omit<PolycopyAvatarProps, 'name'> {
  /** Trader display name */
  displayName?: string | null
  /** Wallet address (used as fallback for name generation) */
  wallet?: string | null
}

function TraderAvatar({
  displayName,
  wallet,
  src,
  alt,
  ...props
}: TraderAvatarProps) {
  // Prefer display name, fall back to wallet for FaceHash generation
  const name = displayName || wallet || 'trader'
  const altText = alt || displayName || (wallet ? `${wallet.slice(0, 6)}...${wallet.slice(-4)}` : 'Trader')

  return (
    <PolycopyAvatar
      src={src}
      name={name}
      alt={altText}
      {...props}
    />
  )
}

/**
 * User Avatar Variant
 * Optimized for logged-in user profiles
 */
interface UserAvatarProps extends Omit<PolycopyAvatarProps, 'name'> {
  /** User email or username */
  identifier?: string | null
}

function UserAvatar({
  identifier,
  src,
  alt,
  ...props
}: UserAvatarProps) {
  const name = identifier || 'polycopy-user'
  const altText = alt || identifier || 'User'

  return (
    <PolycopyAvatar
      src={src}
      name={name}
      alt={altText}
      {...props}
    />
  )
}

/**
 * Market Avatar Variant
 * For market/event avatars - uses Polymarket's official images only, no FaceHash fallback
 */
interface MarketAvatarProps extends React.ComponentProps<typeof AvatarPrimitive.Root> {
  /** Market avatar URL from Polymarket */
  src?: string | null
  /** Market title */
  marketName?: string | null
  /** Alt text */
  alt?: string
  /** Avatar size in pixels (default: 40) */
  size?: number
}

function MarketAvatar({
  src,
  marketName,
  alt,
  size = 40,
  className,
  ...props
}: MarketAvatarProps) {
  const altText = alt || marketName || 'Market'
  
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      className={cn(
        'relative flex shrink-0 overflow-hidden rounded-full',
        className,
      )}
      style={{ width: size, height: size }}
      {...props}
    >
      {/* Show Polymarket's official market image */}
      {src && (
        <AvatarPrimitive.Image
          data-slot="avatar-image"
          src={src}
          alt={altText}
          className="aspect-square size-full object-cover"
        />
      )}
      
      {/* Fallback: Simple initials (no FaceHash for markets) */}
      <AvatarPrimitive.Fallback
        data-slot="avatar-fallback"
        className="flex size-full items-center justify-center rounded-full bg-slate-100 text-slate-700 text-xs font-semibold uppercase"
      >
        {marketName ? marketName.slice(0, 2) : 'M'}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  )
}

export { 
  PolycopyAvatar, 
  TraderAvatar, 
  UserAvatar, 
  MarketAvatar,
  type PolycopyAvatarProps,
  type TraderAvatarProps,
  type UserAvatarProps,
  type MarketAvatarProps,
}
