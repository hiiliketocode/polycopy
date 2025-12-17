import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { createActivityPoller } from '@turnkey/http'
import { TURNKEY_ENABLED } from './config'
import { getTurnkeyClient } from './client'
import type {
  TurnkeyCompletePayload,
  TurnkeyCompleteResult,
  TurnkeyImportInitParams,
  TurnkeyImportInitResult,
} from './types'

const supabaseServiceRole = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * Initialize Turnkey import flow.
 * Creates a sub-organization for the user and returns iframe URL for key import.
 */
export async function initTurnkeyImport(
  params: TurnkeyImportInitParams
): Promise<TurnkeyImportInitResult> {
  if (!TURNKEY_ENABLED) {
    throw new Error('Turnkey disabled')
  }

  const client = getTurnkeyClient()
  if (!client) {
    throw new Error('Turnkey client not available')
  }

  const sessionId = crypto.randomUUID()

  try {
    console.log(
      `[Turnkey Import] Initializing import for user: ${params.userId}`
    )
    
    // Per Turnkey embedded wallet guide: https://docs.turnkey.com/embedded-wallets/code-examples/import
    // Step 1: Get or create Turnkey user
    // Step 2: Initialize import with that user's ID
    // Step 3: Get import bundle and return iframe URL
    
    // Strategy: First try to find existing user, then try to create if not found
    let turnkeyUserId: string | null = null
    
    // Step 1a: Try to find existing user by name
    try {
      console.log(`[Turnkey Import] Looking up existing users...`)
      const usersResponse = await client.turnkeyClient.getUsers({
        organizationId: client.config.organizationId,
      })
      
      const existing = usersResponse.users?.find(
        (u: any) => u.userName === `user-${params.userId}`
      )
      
      if (existing) {
        turnkeyUserId = existing.userId
        console.log(`[Turnkey Import] Found existing user: ${turnkeyUserId}`)
      }
    } catch (lookupError: any) {
      console.log(`[Turnkey Import] User lookup failed: ${lookupError.message}`)
    }
    
    // Step 1b: If user doesn't exist, try to create it
    if (!turnkeyUserId) {
      try {
        console.log(`[Turnkey Import] Creating new Turnkey user...`)
        const createUserResponse = await client.turnkeyClient.createUsers({
          organizationId: client.config.organizationId,
          timestampMs: String(Date.now()),
          type: 'ACTIVITY_TYPE_CREATE_USERS_V3',
          parameters: {
            users: [
              {
                userName: `user-${params.userId}`,
                apiKeys: [],
                authenticators: [],
                oauthProviders: [],
                userTags: [],
              },
            ],
          },
        })
        
        let userActivity = createUserResponse.activity
        if (userActivity.status === 'ACTIVITY_STATUS_PENDING') {
          const poller = createActivityPoller({
            client: client.turnkeyClient,
            requestFn: (input: { organizationId: string; activityId: string }) =>
              client.turnkeyClient.getActivity(input),
          })
          userActivity = await poller({
            organizationId: client.config.organizationId,
            activityId: userActivity.id,
          })
        }
        
        if (userActivity.status === 'ACTIVITY_STATUS_COMPLETED') {
          const userIds = (userActivity.result as any)?.createUsersResultV3?.userIds
          if (userIds && userIds.length > 0) {
            turnkeyUserId = userIds[0]
            console.log(`[Turnkey Import] Created user: ${turnkeyUserId}`)
          }
        }
      } catch (createError: any) {
        console.error(`[Turnkey Import] User creation failed: ${createError.message}`)
        
        // Check if it's a permission error
        if (createError.message?.includes('permission') || createError.message?.includes('PERMISSION')) {
          throw new Error(
            `Your API key needs permission to create users. ` +
            `\n\n` +
            `TO FIX THIS:\n` +
            `1. Log into Turnkey Dashboard as the ORGANIZATION OWNER\n` +
            `2. Go to: Organization → Policies → Create Policy\n` +
            `3. Create these TWO policies (copy the JSON exactly):\n\n` +
            `POLICY 1 - Allow creating users:\n` +
            `{\n` +
            `  "policyName": "Allow API key to create users",\n` +
            `  "effect": "EFFECT_ALLOW",\n` +
            `  "consensus": "approvers.any(user, user.id == '1ddb8285-3a4e-4f66-bea8-28020f77fc52')",\n` +
            `  "condition": "activity.resource == 'USER' && activity.action == 'CREATE'"\n` +
            `}\n\n` +
            `POLICY 2 - Allow import initialization:\n` +
            `{\n` +
            `  "policyName": "Allow API key to init import",\n` +
            `  "effect": "EFFECT_ALLOW",\n` +
            `  "consensus": "approvers.any(user, user.id == '1ddb8285-3a4e-4f66-bea8-28020f77fc52')",\n` +
            `  "condition": "activity.type == 'ACTIVITY_TYPE_INIT_IMPORT_PRIVATE_KEY'"\n` +
            `}\n\n` +
            `Your User ID: 1ddb8285-3a4e-4f66-bea8-28020f77fc52\n` +
            `Your Organization ID: a26b6b83-e1fd-44da-8176-99bd9b3de580\n\n` +
            `Reference: https://docs.turnkey.com/concepts/policies/examples/access-control`
          )
        }
        throw createError
      }
    }
    
    if (!turnkeyUserId) {
      throw new Error(
        `Failed to create or find Turnkey user. ` +
        `Please ensure your API key has permission to create users, ` +
        `or create the user manually in the Turnkey dashboard first.`
      )
    }
    
    // Step 2: Initialize import (per Turnkey guide)
    const initResponse = await client.turnkeyClient.initImportPrivateKey({
      organizationId: client.config.organizationId,
      timestampMs: String(Date.now()),
      type: 'ACTIVITY_TYPE_INIT_IMPORT_PRIVATE_KEY',
      parameters: {
        userId: turnkeyUserId,
      },
    })
    
    // Handle PENDING activities with polling
    let activity = initResponse.activity
    
    if (activity.status === 'ACTIVITY_STATUS_PENDING') {
      console.log(
        `[Turnkey Import] Import init is PENDING, polling for completion...`
      )
      
      const poller = createActivityPoller({
        client: client.turnkeyClient,
        requestFn: (input: { organizationId: string; activityId: string }) =>
          client.turnkeyClient.getActivity(input),
      })

      activity = await poller({
        organizationId: client.config.organizationId,
        activityId: activity.id,
      })
    }

    if (activity.status !== 'ACTIVITY_STATUS_COMPLETED') {
      throw new Error(
        `Import initialization failed with status: ${activity.status}`
      )
    }

    // Get the import bundle from the result
    const importBundle = (activity.result as any)?.initImportPrivateKeyResult?.importBundle

    if (!importBundle) {
      throw new Error('Import bundle not found in response')
    }

    console.log(
      `[Turnkey Import] Import bundle received, generating iframe URL`
    )

    // Generate iframe URL using the import bundle
    // Per Turnkey docs: use import.turnkey.com iframe
    // The iframe will handle encryption and import
    const iframeUrl = `https://import.turnkey.com?organizationId=${client.config.organizationId}&userId=${turnkeyUserId}&sessionId=${sessionId}&importBundle=${encodeURIComponent(importBundle)}`


    return {
      sessionId,
      iframeUrl,
      note: 'Turnkey import ready. Use the iframe to import your private key securely.',
    }
  } catch (error: any) {
    console.error('Turnkey import init error:', error)
    throw new Error(`Failed to initialize Turnkey import: ${error.message}`)
  }
}

/**
 * Complete Turnkey import and store wallet data in database.
 */
export async function completeTurnkeyImport(
  payload: TurnkeyCompletePayload,
  userId: string
): Promise<TurnkeyCompleteResult> {
  if (!TURNKEY_ENABLED) {
    throw new Error('Turnkey disabled')
  }

  try {
    // Store Turnkey wallet data in Supabase
    const { data: walletData, error: insertError } = await supabaseServiceRole
      .from('turnkey_wallets')
      .insert({
        user_id: userId,
        turnkey_sub_org_id: payload.subOrganizationId,
        turnkey_wallet_id: payload.walletId,
        turnkey_private_key_id: payload.privateKeyId,
        eoa_address: payload.eoaAddress || '',
        polymarket_account_address: payload.polymarketProxyAddress || '',
        wallet_type: 'magic_proxy',
      })
      .select()
      .single()

    if (insertError) {
      console.error('Error storing Turnkey wallet:', insertError)
      throw new Error(`Failed to store wallet: ${insertError.message}`)
    }

    return {
      sessionId: payload.sessionId,
      stored: true,
      note: 'Turnkey wallet imported and stored successfully.',
      echo: payload,
    }
  } catch (error: any) {
    console.error('Turnkey import completion error:', error)
    return {
      sessionId: payload.sessionId,
      stored: false,
      note: `Import completed but storage failed: ${error.message}`,
      echo: payload,
    }
  }
}

