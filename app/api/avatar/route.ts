import { NextRequest } from 'next/server'

/**
 * Avatar Image API Route (simplified - no FaceHash dependency)
 * Returns a simple SVG with initials for /api/avatar?name=alice
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const name = searchParams.get('name') || '?'
  const size = parseInt(searchParams.get('size') || '40', 10)
  const initials = name.slice(0, 2).toUpperCase()

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="100%" height="100%" fill="#FEF3C7"/>
  <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" font-family="system-ui,sans-serif" font-size="${size * 0.4}" font-weight="600" fill="#92400E">${initials}</text>
</svg>`

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=86400',
    },
  })
}
