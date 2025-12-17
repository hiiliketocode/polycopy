import { NextResponse } from 'next/server'
import { TURNKEY_ENABLED } from '@/lib/turnkey/config'
import { getTurnkeyClient } from '@/lib/turnkey/client'

/**
 * Test endpoint to verify Turnkey connection and get organization info
 * This helps identify the organization ID if you don't have it
 */
export async function GET() {
  if (!TURNKEY_ENABLED) {
    return NextResponse.json(
      { enabled: false, error: 'Turnkey disabled via TURNKEY_ENABLED' },
      { status: 503 }
    )
  }

  const client = getTurnkeyClient()
  if (!client) {
    return NextResponse.json(
      { error: 'Turnkey client not available' },
      { status: 500 }
    )
  }

  try {
    // Try to get organization info
    // The organizationId is in the config, but let's verify it works
    const orgId = client.config.organizationId

    // Try to get users to verify connection
    const usersResponse = await client.turnkeyClient.getUsers({
      organizationId: orgId,
    })

    // Get the API key's user ID (the user that owns the API key)
    // This is needed for policy creation
    const apiKeyUser = usersResponse.users?.find((u: any) => {
      // The API key user should have an API key matching our public key
      return u.apiKeys?.some((key: any) => 
        key.apiKeyId?.includes(client.config.publicKey.substring(0, 20))
      )
    })

    return NextResponse.json({
      success: true,
      organizationId: orgId,
      organizationIdFromConfig: orgId,
      apiKeyPublicKey: client.config.publicKey.substring(0, 30) + '...',
      totalUsers: usersResponse.users?.length || 0,
      apiKeyUserId: apiKeyUser?.userId || 'Not found - check dashboard',
      apiKeyUserName: apiKeyUser?.userName || 'Not found',
      message: 'Connection successful! Use the apiKeyUserId in your policy JSON.',
    })
  } catch (error: any) {
    console.error('Turnkey test connection error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'Failed to connect to Turnkey',
        details: error?.toString(),
        organizationIdFromConfig: client.config.organizationId,
      },
      { status: 500 }
    )
  }
}


