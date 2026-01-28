/**
 * Call the PolyScore Edge Function to get trade analysis
 */

export interface OriginalTrade {
  wallet_address: string
  condition_id: string
  side: "BUY" | "SELL"
  price: number
  shares_normalized: number
  timestamp: string // ISO timestamp
}

export interface MarketContext {
  current_price: number
  current_timestamp: string // ISO timestamp
  market_volume_total?: number | null
  market_tags?: string | null // JSON string array
  market_bet_structure?: string | null
  market_market_subtype?: string | null
  market_duration_days?: number | null // Calculated from start/end times
  market_title?: string | null
  market_event_slug?: string | null
  market_start_time_unix?: number | null
  market_end_time_unix?: number | null
  market_volume_1_week?: number | null
  market_volume_1_month?: number | null
  market_negative_risk_id?: string | null
  game_start_time?: string | null // ISO timestamp
  token_label?: string | null
  token_id?: string | null
}

export interface PolyScoreRequest {
  // --- The Triggering Trade (The one being copied) ---
  original_trade: OriginalTrade
  
  // --- The Live Market State ---
  market_context: MarketContext

  // --- The User's Context ---
  user_slippage: number
}

export interface PolyScoreResponse {
  poly_score: number
  alpha_score: number
  conviction_score: number
  value_score: number
  ai_profit_probability: number
  subtype_specific_win_rate: number
  bet_type_specific_win_rate: number
  position_adjustment_style: string
  trade_sequence: number
  is_hedged: number
}

export interface PolyScoreError {
  error: string
  details?: string
}

/**
 * Get PolyScore for a trade
 */
export async function getPolyScore(
  request: PolyScoreRequest,
  accessToken?: string
): Promise<PolyScoreResponse> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set')
  }
  if (!supabaseAnonKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is not set')
  }

  // Ensure URL doesn't have trailing slash
  const baseUrl = supabaseUrl.replace(/\/$/, '')
  const url = `${baseUrl}/functions/v1/get-polyscore`
  
  // Use access token if provided, otherwise use anon key
  const authToken = accessToken || supabaseAnonKey
  
  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${authToken}`,
    'apikey': supabaseAnonKey,
  }
  
  // Validate URL is valid
  try {
    new URL(url)
  } catch (urlError) {
    throw new Error(`Invalid Supabase URL: ${supabaseUrl}. Please check NEXT_PUBLIC_SUPABASE_URL environment variable.`)
  }
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📤 [PolyScore] API CALL - SENDING FULL REQUEST')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('URL:', url)
  console.log('Method: POST')
  console.log('Headers:', {
    'Content-Type': requestHeaders['Content-Type'],
    'Authorization': `Bearer ${authToken.substring(0, 20)}...`,
    'apikey': `${supabaseAnonKey.substring(0, 20)}...`,
  })
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📦 COMPLETE PAYLOAD BEING SENT TO API (ALL FIELDS):')
  console.log(JSON.stringify(request, null, 2))
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('Payload Object (expandable in console):', request)
  console.log('Auth Token Type:', accessToken ? 'User Session Token' : 'Anon Key')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  let response: Response
  try {
    response = await fetch(
      url,
      {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify(request), // Send the FULL request object, not just the 4 core fields
      }
    )
  } catch (fetchError: any) {
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.error('❌ [PolyScore] FETCH ERROR')
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.error('Error Type:', fetchError?.name || 'Unknown')
    console.error('Error Message:', fetchError?.message)
    console.error('Error Stack:', fetchError?.stack)
    console.error('URL:', url)
    console.error('Supabase URL:', supabaseUrl)
    console.error('Has Anon Key:', !!supabaseAnonKey)
    console.error('Request Headers:', Object.keys(requestHeaders))
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    
    // Provide helpful error message
    if (fetchError?.message?.includes('Failed to fetch') || fetchError?.name === 'TypeError') {
      throw new Error(`Network error: Unable to reach Edge Function at ${url}. This usually means:\n1. The Edge Function is not deployed\n2. The Supabase URL is incorrect\n3. There's a CORS or network issue\n\nCheck that NEXT_PUBLIC_SUPABASE_URL is set correctly and the function is deployed.`)
    }
    
    throw new Error(`Network error: ${fetchError?.message || 'Failed to fetch'}`)
  }

  // Get response data
  let responseText = ''
  let responseData: any
  
  try {
    responseText = await response.text()
  } catch (textError: any) {
    console.error('[PolyScore] Failed to read response text:', textError)
    throw new Error(`Failed to read response: ${textError?.message}`)
  }
  
  try {
    responseData = JSON.parse(responseText)
  } catch {
    responseData = { raw: responseText }
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📥 [PolyScore] RESPONSE DATA')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('Status:', response.status, response.statusText)
  console.log('Status OK:', response.ok)
  console.log('Response Headers:', Object.fromEntries(response.headers.entries()))
  console.log('Response Body:', JSON.stringify(responseData, null, 2))
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  if (!response.ok) {
    const errorData: PolyScoreError = typeof responseData === 'object' && responseData.error 
      ? responseData 
      : {
          error: 'Unknown error',
          details: `HTTP ${response.status}: ${response.statusText}`,
        }
    
    const errorMessage = errorData.details || errorData.error || `HTTP ${response.status}: ${response.statusText}`
    
    // Provide more helpful error messages
    if (response.status === 401) {
      throw new Error(`Authentication failed (401). Check that NEXT_PUBLIC_SUPABASE_ANON_KEY is set correctly. ${errorMessage}`)
    }
    
    throw new Error(errorMessage)
  }

  console.log('✅ [PolyScore] SUCCESS - Parsed Response:', JSON.stringify(responseData, null, 2))
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  
  return responseData as PolyScoreResponse
}
