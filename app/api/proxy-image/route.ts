import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const imageUrl = searchParams.get('url')

  if (!imageUrl) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 })
  }

  // Only allow Polymarket S3 URLs for security
  if (!imageUrl.startsWith('https://polymarket-upload.s3.us-east-2.amazonaws.com/')) {
    return NextResponse.json({ error: 'Invalid image URL' }, { status: 400 })
  }

  try {
    // Fetch the image from S3
    const response = await fetch(imageUrl)
    
    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to fetch image' }, { status: response.status })
    }

    // Get the image as a buffer
    const imageBuffer = await response.arrayBuffer()
    
    // Return the image with proper CORS headers
    return new NextResponse(imageBuffer, {
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'image/jpeg',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch (error) {
    console.error('Error proxying image:', error)
    return NextResponse.json({ error: 'Failed to proxy image' }, { status: 500 })
  }
}
