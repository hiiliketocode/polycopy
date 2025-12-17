export interface TurnkeyConfig {
  publicKey: string
  privateKey: string
  organizationId: string
}

export interface TurnkeyRequestOptions<TBody = unknown> {
  endpoint: string
  method?: 'POST' | 'GET'
  body?: TBody
}

import type { TurnkeyClient as TurnkeySDKClient } from '@turnkey/http'

export interface TurnkeyClient {
  isEnabled: true
  config: TurnkeyConfig
  call<TResponse, TBody = unknown>(
    options: TurnkeyRequestOptions<TBody>
  ): Promise<TResponse>
  turnkeyClient: TurnkeySDKClient
}

export interface TurnkeyImportInitParams {
  userId: string
}

export interface TurnkeyImportInitResult {
  sessionId: string
  iframeUrl: string
  note: string
}

export interface TurnkeyCompletePayload {
  sessionId: string
  subOrganizationId: string
  walletId: string
  privateKeyId: string
  eoaAddress?: string
  polymarketProxyAddress?: string
}

export interface TurnkeyCompleteResult {
  sessionId: string
  stored: boolean
  note: string
  echo: TurnkeyCompletePayload
}

