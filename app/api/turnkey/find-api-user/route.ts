import { NextResponse } from 'next/server'
import { TURNKEY_ENABLED } from '@/lib/turnkey/config'
import { getTurnkeyClient } from '@/lib/turnkey/client'

/**
 * Helper endpoint to find which user owns the API key
 * This helps identify the correct user ID for policy creation
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
    const orgId = client.config.organizationId
    const apiPublicKey = client.config.publicKey

    // Get all users
    const usersResponse = await client.turnkeyClient.getUsers({
      organizationId: orgId,
    })

    // Get all API keys to find which user owns our API key
    const allUsers = usersResponse.users || []
    
    // Try to find the user by checking API keys
    let apiKeyUser = null
    let allApiKeys: any[] = []

    for (const user of allUsers) {
      if (user.apiKeys && user.apiKeys.length > 0) {
        for (const apiKey of user.apiKeys) {
          const publicKey = (apiKey as any).credential?.publicKey || (apiKey as any).publicKey
          allApiKeys.push({
            userId: user.userId,
            userName: user.userName,
            apiKeyId: apiKey.apiKeyId,
            apiKeyName: apiKey.apiKeyName,
            publicKey: publicKey ? publicKey.substring(0, 30) + '...' : 'N/A',
          })

          // Check if this API key matches our public key
          if (publicKey === apiPublicKey) {
            apiKeyUser = {
              userId: user.userId,
              userName: user.userName,
              apiKeyId: apiKey.apiKeyId,
              apiKeyName: apiKey.apiKeyName,
            }
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      organizationId: orgId,
      apiKeyPublicKey: apiPublicKey.substring(0, 30) + '...',
      apiKeyPublicKeyFull: apiPublicKey,
      totalUsers: allUsers.length,
      apiKeyUser: apiKeyUser || {
        message: 'API key user not found. Check if the API key is associated with a user in the dashboard.',
        note: 'The user ID you provided (_h0F56qMfoM-yG0QSTRlpQ) might be correct - use it in the policy.',
      },
      allUsers: allUsers.map((u: any) => ({
        userId: u.userId,
        userName: u.userName,
        hasApiKeys: (u.apiKeys?.length || 0) > 0,
      })),
      allApiKeys: allApiKeys,
      policyJson: apiKeyUser
        ? {
            policyName: 'Allow API key to create users',
            effect: 'EFFECT_ALLOW',
            consensus: `approvers.any(user, user.id == '${apiKeyUser.userId}')`,
            condition: "activity.type == 'ACTIVITY_TYPE_CREATE_USERS_V3'",
          }
        : {
            policyName: 'Allow API key to create users',
            effect: 'EFFECT_ALLOW',
            consensus: `approvers.any(user, user.id == '_h0F56qMfoM-yG0QSTRlpQ')`,
            condition: "activity.type == 'ACTIVITY_TYPE_CREATE_USERS_V3'",
            note: 'Using the user ID you provided. If this doesn\'t work, check the dashboard.',
          },
    })
  } catch (error: any) {
    console.error('Find API user error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'Failed to find API key user',
        details: error?.toString(),
        organizationId: client.config.organizationId,
        apiKeyPublicKey: client.config.publicKey.substring(0, 30) + '...',
      },
      { status: 500 }
    )
  }
}


