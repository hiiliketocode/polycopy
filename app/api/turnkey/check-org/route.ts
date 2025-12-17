import { NextResponse } from 'next/server'
import { getTurnkeyClient } from '@/lib/turnkey/client'

/**
 * GET /api/turnkey/check-org
 * 
 * Check which organization the API key belongs to
 */
export async function GET() {
  const client = getTurnkeyClient()
  
  if (!client) {
    return NextResponse.json(
      { error: 'Turnkey client not available' },
      { status: 500 }
    )
  }

  try {
    // Try to get organization info using the current config
    const orgId = client.config.organizationId
    
    console.log('[Turnkey Check] Configured org ID:', orgId)
    
    // Try to call getUsers - if this works, the API key is valid for this org
    const usersResponse = await client.turnkeyClient.getUsers({
      organizationId: orgId,
    })

    return NextResponse.json({
      success: true,
      configuredOrgId: orgId,
      apiKeyPublicKey: client.config.publicKey.substring(0, 30) + '...',
      totalUsers: usersResponse.users?.length || 0,
      message: 'API key is valid for this organization ✅',
    })
  } catch (error: any) {
    console.error('[Turnkey Check] Error:', error)
    
    // Parse the error to extract org IDs if present
    const errorStr = error?.message || error?.toString() || ''
    
    return NextResponse.json({
      success: false,
      configuredOrgId: client.config.organizationId,
      apiKeyPublicKey: client.config.publicKey.substring(0, 30) + '...',
      error: errorStr,
      hint: 'The TURNKEY_ORGANIZATION_ID might be wrong. Check the error message for the correct organization ID.',
    })
  }
}


