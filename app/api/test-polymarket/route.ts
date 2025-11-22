import { NextResponse } from 'next/server'

export async function GET() {
  const testWallet = '0x6af75d4e4aaf700450efbac3708cce1665810ff1'
  
  try {
    const response = await fetch(
      `https://data-api.polymarket.com/positions?user=${testWallet}`
    )
    
    const data = await response.json()
    
    return NextResponse.json({ 
      success: true, 
      wallet: testWallet,
      positionsCount: data.length,
      data: data.slice(0, 3) // Return first 3 positions for testing
    })
  } catch (error) {
    return NextResponse.json({ 
      success: false, 
      error: String(error) 
    }, { status: 500 })
  }
}

