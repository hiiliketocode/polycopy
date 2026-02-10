import { toFacehashHandler } from 'facehash/next'

/**
 * FaceHash Avatar Image API Route
 * 
 * Generates unique avatar images on-the-fly for use in:
 * - Email templates
 * - Open Graph images
 * - External embeds
 * - Any context requiring a URL-based image
 * 
 * Usage:
 * - /api/avatar?name=alice
 * - /api/avatar?name=0x1234567890abcdef&size=80
 * 
 * Query Parameters:
 * - name: String to generate avatar from (required)
 * - size: Avatar size in pixels (default: 40)
 * - shape: 'square' | 'squircle' | 'round' (default: 'round')
 * - showInitial: 'true' | 'false' (default: 'false')
 * 
 * Uses consistent lighter yellow color (#FBBF24) for all avatars.
 * Images are cached indefinitely for performance.
 */

export const { GET } = toFacehashHandler({
  // Consistent lighter yellow color (Yellow-400)
  colors: ['#FBBF24'],
  // Default to not showing initials (let the face be the focus)
  showInitial: false,
  // Use solid variant for consistency
  variant: 'solid',
})
