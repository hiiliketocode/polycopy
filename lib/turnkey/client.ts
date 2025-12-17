import { TurnkeyClient } from '@turnkey/http'
import { ApiKeyStamper } from '@turnkey/api-key-stamper'
import { TURNKEY_ENABLED, loadTurnkeyConfig } from './config'
import type { TurnkeyClient as TurnkeyClientType, TurnkeyRequestOptions } from './types'

const TURNKEY_BASE_URL =
  process.env.TURNKEY_BASE_URL || 'https://api.turnkey.com'

/**
 * Returns a Turnkey API client with proper request signing.
 * - With TURNKEY_ENABLED=false, returns null and does nothing.
 * - With TURNKEY_ENABLED=true, validates required env vars and makes signed API calls.
 */
export function getTurnkeyClient(): TurnkeyClientType | null {
  if (!TURNKEY_ENABLED) return null

  const config = loadTurnkeyConfig()
  if (!config) return null

  // Create stamper for signing requests with API keys
  const stamper = new ApiKeyStamper({
    apiPublicKey: config.publicKey,
    apiPrivateKey: config.privateKey,
  })

  // Create Turnkey client with stamper
  const turnkeyClient = new TurnkeyClient(
    {
      baseUrl: TURNKEY_BASE_URL,
    },
    stamper
  )

  const call = async <TResponse, TBody = unknown>(
    options: TurnkeyRequestOptions<TBody>
  ): Promise<TResponse> => {
    const { endpoint, method = 'POST', body } = options

    try {
      // Use Turnkey SDK's request method which handles signing automatically
      // Include organizationId in the request body if it's an activity
      const requestBody = body as any
      if (requestBody && requestBody.type && !requestBody.organizationId) {
        requestBody.organizationId = config.organizationId
      }

      // Turnkey SDK request method expects (url, body) where body is the request payload
      const response = await turnkeyClient.request<TBody, TResponse>(
        endpoint,
        requestBody as TBody
      )
      return response as TResponse
    } catch (error: any) {
      const errorMessage =
        error?.message || error?.toString() || 'Unknown Turnkey API error'
      throw new Error(`Turnkey API error: ${errorMessage}`)
    }
  }

  return {
    isEnabled: true,
    config,
    call,
    turnkeyClient,
  }
}

