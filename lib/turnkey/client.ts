import { TurnkeyClient, createActivityPoller } from '@turnkey/http'
import { ApiKeyStamper } from '@turnkey/api-key-stamper'
import { TURNKEY_ENABLED, loadTurnkeyConfig } from './config'
import type { TurnkeyClient as TurnkeyClientType, TurnkeyRequestOptions } from './types'
import { TypedDataDomain, TypedDataField } from 'ethers'
import { _TypedDataEncoder as TypedDataEncoder } from 'ethers/lib/utils'

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

export type TurnkeyTypedDataPayload = {
  domain: TypedDataDomain
  types: Record<string, Array<TypedDataField>>
  primaryType: string
  message: Record<string, unknown>
}

export async function turnkeySignTypedData(params: {
  privateKeyId: string
  typedData: TurnkeyTypedDataPayload
}): Promise<string> {
  const client = getTurnkeyClient()
  if (!client) {
    throw new Error('Turnkey client not available')
  }

  const { privateKeyId, typedData } = params
  const digest = TypedDataEncoder.hash(typedData.domain, typedData.types, typedData.message)

  const signResponse = await client.turnkeyClient.signRawPayload({
    organizationId: client.config.organizationId,
    timestampMs: String(Date.now()),
    type: 'ACTIVITY_TYPE_SIGN_RAW_PAYLOAD_V2',
    parameters: {
      signWith: privateKeyId,
      payload: digest,
      encoding: 'PAYLOAD_ENCODING_HEXADECIMAL',
      hashFunction: 'HASH_FUNCTION_NO_OP',
    },
  })

  let signActivity = signResponse.activity

  if (signActivity.status === 'ACTIVITY_STATUS_PENDING') {
    const poller = createActivityPoller({
      client: client.turnkeyClient,
      requestFn: (input: { organizationId: string; activityId: string }) =>
        client.turnkeyClient.getActivity(input),
    })

    signActivity = await poller({
      organizationId: client.config.organizationId,
      activityId: signActivity.id,
    })
  }

  if (signActivity.status !== 'ACTIVITY_STATUS_COMPLETED') {
    throw new Error(`Typed data signing failed with status: ${signActivity.status}`)
  }

  const result = signActivity.result?.signRawPayloadResult
  if (!result || !result.r || !result.s || !result.v) {
    throw new Error('Signature components not found in activity result')
  }

  const normalize = (component: string) => (component.startsWith('0x') ? component.slice(2) : component)
  return `0x${normalize(result.r)}${normalize(result.s)}${normalize(result.v)}`
}
