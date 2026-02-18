import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Service role client (bypasses RLS)
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
})

// Normalize tags coming from a variety of shapes (JSON string, array of strings, etc.)
// CRITICAL: Must lowercase to match semantic_mapping table format
function normalizeTags(rawTags: any): string[] {
  if (!rawTags) return []
  if (Array.isArray(rawTags)) {
    return rawTags
      .map((t: any) => (typeof t === 'string' ? t : String(t)))
      .map((t: string) => t.trim().toLowerCase()) // CRITICAL: lowercase for semantic_mapping
      .filter((t: string) => t.length > 0)
  }

  if (typeof rawTags === 'string') {
    try {
      const parsed = JSON.parse(rawTags)
      if (Array.isArray(parsed)) {
        return parsed
          .map((t: any) => (typeof t === 'string' ? t : String(t)))
          .map((t: string) => t.trim().toLowerCase()) // CRITICAL: lowercase for semantic_mapping
          .filter((t: string) => t.length > 0)
      }
    } catch {
      // Not JSON, treat as a single tag string
    }

    const single = rawTags.trim().toLowerCase() // CRITICAL: lowercase for semantic_mapping
    return single.length > 0 ? [single] : []
  }

  return []
}

// Lightweight bet structure inference (mirrors frontend logic)
// NOTE: Must match profile_stats structures: YES_NO, STANDARD, OVER_UNDER, SPREAD
function inferBetStructure(title: string | null | undefined): string | null {
  const t = (title || '').toLowerCase()
  if (t.includes('over') || t.includes('under') || t.includes('o/u')) return 'OVER_UNDER'
  if (t.includes('spread') || t.includes('handicap')) return 'SPREAD'
  // "Will X happen?" questions are YES/NO bets, not WINNER
  // "winner" in context of "who will win" is also YES/NO per outcome
  if (t.includes('will') || t.includes('winner')) return 'YES_NO'
  return 'STANDARD'
}

// Fallback niche inference using semantic_mapping (service role avoids RLS issues)
async function inferNicheFromTags(tags: string[]): Promise<{ niche: string | null; marketType?: string | null; source?: string; fromTag?: string }> {
  const cleanTags = tags
    .map((t) => t.toLowerCase().trim())
    .filter((t) => t.length > 0)

  if (cleanTags.length === 0) {
    console.log('[ensureMarket] No tags to classify')
    return { niche: null, marketType: null, source: 'no_tags' }
  }

  // Try case-sensitive match first (original_tag should be lowercase)
  let { data: mappings, error } = await supabase
    .from('semantic_mapping')
    .select('clean_niche, type, specificity_score, original_tag')
    .in('original_tag', cleanTags)

  // If no matches and we have tags, try case-insensitive match as fallback
  if ((!mappings || mappings.length === 0) && cleanTags.length > 0) {
    // Try each tag individually with ilike (case-insensitive) and collect ALL matches
    const allCiMappings: any[] = [];
    for (const tag of cleanTags) {
      const { data: ciMappings, error: ciError } = await supabase
        .from('semantic_mapping')
        .select('clean_niche, type, specificity_score, original_tag')
        .ilike('original_tag', tag)
      
      if (!ciError && ciMappings && ciMappings.length > 0) {
        allCiMappings.push(...ciMappings);
      }
    }
    
    if (allCiMappings.length > 0) {
      mappings = allCiMappings;
    }
  }

  if (error) {
    console.error('[ensureMarket] Error querying semantic_mapping:', error)
    return { niche: null, marketType: null, source: 'semantic_mapping_error' }
  }

  if (mappings && mappings.length > 0) {
    mappings.sort((a: any, b: any) => (a.specificity_score || 99) - (b.specificity_score || 99))
    const best = mappings[0]
    const cleanNiche = (best?.clean_niche || '').toUpperCase()
    const marketType = (best?.type || '').toUpperCase() || null
    return {
      niche: cleanNiche || null,
      marketType: marketType || null,
      source: 'semantic_mapping',
      fromTag: best?.original_tag,
    }
  }

  return { niche: null, marketType: null, source: 'no_match' }
}

// NHL team names for fallback detection (when title doesn't include "nhl" or "hockey")
const NHL_TEAMS = [
  'avalanche', 'blackhawks', 'blue jackets', 'blues', 'bruins', 'canadiens',
  'canucks', 'capitals', 'coyotes', 'devils', 'ducks', 'flames', 'flyers',
  'golden knights', 'hurricanes', 'islanders', 'jets', 'kings', 'kraken',
  'lightning', 'maple leafs', 'oilers', 'panthers', 'penguins', 'predators',
  'rangers', 'red wings', 'sabres', 'senators', 'sharks', 'stars', 'wild'
]

function fallbackNicheFromTitle(title: string | null | undefined): string {
  const t = (title || '').toLowerCase()
  if (t.includes('tennis')) return 'TENNIS'
  if (t.includes('nba') || t.includes('basketball')) return 'NBA'
  if (t.includes('nfl') || t.includes('football')) return 'NFL'
  // NHL: check explicit keywords first, then team names
  if (t.includes('nhl') || t.includes('hockey')) return 'NHL'
  // Check for NHL team names (e.g., "Hurricanes vs. Rangers")
  const matchedNhlTeams = NHL_TEAMS.filter(team => t.includes(team))
  if (matchedNhlTeams.length >= 2) return 'NHL' // Two teams = likely NHL matchup
  if (t.includes('politics') || t.includes('election')) return 'POLITICS'
  if (t.includes('crypto') || t.includes('bitcoin')) return 'CRYPTO'
  return 'OTHER'
}

function mapApiMarketToRow(market: any, source: 'gamma' | 'clob' = 'gamma') {
  if (source === 'gamma') {
    const parseJson = (v: unknown) => {
      if (typeof v === 'string') { try { return JSON.parse(v) } catch { return v } }
      return v ?? null
    }
    const toIso = (raw: string | null | undefined) => {
      if (!raw) return null
      const d = new Date(raw)
      return Number.isNaN(d.getTime()) ? null : d.toISOString()
    }
    const outcomes = parseJson(market?.outcomes)
    return {
      condition_id: market?.conditionId ?? null,
      title: market?.question ?? market?.title ?? null,
      tags: market?.tags ?? [],
      market_type: null as string | null,
      market_subtype: null as string | null,
      final_niche: null as string | null,
      bet_structure: null as string | null,
      volume_total: market?.volume != null ? Number(market.volume) : null,
      volume_1_week: market?.volume1wk != null ? Number(market.volume1wk) : null,
      volume_1_month: market?.volume1mo != null ? Number(market.volume1mo) : null,
      volume_1_year: market?.volume1yr != null ? Number(market.volume1yr) : null,
      status: market?.resolvedBy ? 'resolved' : market?.closed ? 'closed' : market?.active ? 'active' : 'open',
      image: market?.image ?? null,
      description: market?.description ?? null,
      side_a: Array.isArray(outcomes) && outcomes.length >= 1 ? outcomes[0] : null,
      side_b: Array.isArray(outcomes) && outcomes.length >= 2 ? outcomes[1] : null,
      market_slug: market?.slug ?? null,
      start_time: toIso(market?.startDate),
      end_time: toIso(market?.endDate),
      outcome_prices: parseJson(market?.outcomePrices),
      outcomes: parseJson(market?.outcomes),
      updated_at: new Date().toISOString(),
    } as any
  }

  // CLOB fallback
  const row: any = {
    condition_id: market?.condition_id ?? null,
    title: market?.question ?? market?.title ?? null,
    tags: market?.tags ?? [],
    market_type: null,
    market_subtype: null,
    bet_structure: null,
    volume_total: market?.volume_total ?? null,
    volume_1_week: market?.volume_1_week ?? null,
    volume_1_month: market?.volume_1_month ?? null,
    volume_1_year: market?.volume_1_year ?? null,
    status: market?.closed ? 'closed' : market?.resolved ? 'resolved' : 'open',
    updated_at: new Date().toISOString(),
  }
  if (market?.category && Array.isArray(row.tags) && !row.tags.includes(market.category)) {
    row.tags = [...row.tags, market.category]
  }
  return row
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const conditionId = searchParams.get('conditionId')?.trim()

  if (!conditionId || !conditionId.startsWith('0x')) {
    return NextResponse.json({ error: 'conditionId is required' }, { status: 400 })
  }

  try {
    // Step 1: Check if market exists in database
    const { data: existingMarket, error: queryError } = await supabase
      .from('markets')
      .select('market_type, market_subtype, final_niche, bet_structure, tags, title')
      .eq('condition_id', conditionId)
      .maybeSingle()

    if (queryError) {
      console.error('[ensureMarket] Error querying database:', queryError)
      return NextResponse.json(
        { error: 'Database query failed', details: queryError.message },
        { status: 500 }
      )
    }

    // Step 2: If market exists, try to enrich missing classification using service-role (bypasses RLS)
    if (existingMarket) {
      const tags = normalizeTags(existingMarket.tags)
      const hasTags = tags.length > 0

      let updatedFields: Record<string, any> = {}

      // Market type: prefer existing, otherwise infer from tags
      let finalMarketType = (existingMarket.market_type || '').trim().toUpperCase() || null
      if (!finalMarketType && hasTags) {
        const { marketType } = await inferNicheFromTags(tags)
        finalMarketType = marketType || null
      }
      if (!existingMarket.market_type && finalMarketType) {
        updatedFields.market_type = finalMarketType
      }

      // Niche: prefer existing, otherwise infer from tags with service role, then fallback to title
      // Check both market_subtype and final_niche (redundancy for compatibility)
      let finalNiche = (existingMarket.market_subtype || existingMarket.final_niche || '').trim().toUpperCase() || null
      
      // Special case: if market is classified as "OTHER", try to re-classify from title
      // This allows us to fix markets that were previously misclassified
      const existingNicheIsOther = finalNiche === 'OTHER'
      if (existingNicheIsOther) {
        const betterNiche = fallbackNicheFromTitle(existingMarket.title)
        if (betterNiche && betterNiche !== 'OTHER') {
          console.log(`[ensureMarket] Re-classifying market from OTHER to ${betterNiche} based on title: "${existingMarket.title}"`)
          finalNiche = betterNiche
          updatedFields.market_subtype = finalNiche
          updatedFields.final_niche = finalNiche
        }
      }
      
      if (!finalNiche && hasTags) {
        const { niche } = await inferNicheFromTags(tags)
        finalNiche = niche || null
      }
      if (!finalNiche) {
        finalNiche = fallbackNicheFromTitle(existingMarket.title)
      }
      // Update both columns if missing (redundancy for compatibility)
      if (!existingMarket.market_subtype && finalNiche) {
        updatedFields.market_subtype = finalNiche
      }
      if (!existingMarket.final_niche && finalNiche) {
        updatedFields.final_niche = finalNiche
      }

      // Bet structure: prefer existing, otherwise infer from title
      let finalBetStructure = (existingMarket.bet_structure || '').trim().toUpperCase() || null
      if (!finalBetStructure) {
        const inferred = inferBetStructure(existingMarket.title)
        if (inferred) finalBetStructure = inferred
      }
      if (!existingMarket.bet_structure && finalBetStructure) {
        updatedFields.bet_structure = finalBetStructure
      }

      // Persist any new fields so downstream calls (and the UI) see classification
      if (Object.keys(updatedFields).length > 0) {
        await supabase
          .from('markets')
          .update(updatedFields)
          .eq('condition_id', conditionId)
      }

      if (hasTags) {
        console.log('[ensureMarket] Market found in database with tags (enriched classification if needed)')
        return NextResponse.json({
          found: true,
          source: 'database',
          market: { 
            ...existingMarket, 
            ...updatedFields, 
            tags,
            market_type: updatedFields.market_type || existingMarket.market_type || null,
            market_subtype: updatedFields.market_subtype || existingMarket.market_subtype || null,
            final_niche: updatedFields.final_niche || existingMarket.final_niche || updatedFields.market_subtype || existingMarket.market_subtype || null,
            bet_structure: updatedFields.bet_structure || existingMarket.bet_structure || null,
          }
        })
      }

      // Market exists but missing tags - fetch from CLOB to update
      console.log('[ensureMarket] Market exists but missing tags, fetching from CLOB...')
    } else {
      console.log('[ensureMarket] Market not in database, fetching from CLOB...')
    }

    // Step 3: Fetch from Gamma API (primary) with CLOB fallback
    let apiMarket: any = null
    let apiSource: 'gamma' | 'clob' = 'gamma'

    try {
      const gammaRes = await fetch(
        `https://gamma-api.polymarket.com/markets?condition_id=${encodeURIComponent(conditionId)}`,
        { cache: 'no-store', signal: AbortSignal.timeout(5000) }
      )
      if (gammaRes.ok) {
        const data = await gammaRes.json()
        apiMarket = Array.isArray(data) && data.length > 0 ? data[0] : null
        if (apiMarket) {
          // Gamma markets don't always include tags — try fetching from the event
          if ((!apiMarket.tags || (Array.isArray(apiMarket.tags) && apiMarket.tags.length === 0)) && apiMarket.slug) {
            try {
              const eventRes = await fetch(
                `https://gamma-api.polymarket.com/events?slug=${encodeURIComponent(apiMarket.slug)}`,
                { cache: 'no-store', signal: AbortSignal.timeout(3000) }
              )
              if (eventRes.ok) {
                const eventData = await eventRes.json()
                const event = Array.isArray(eventData) && eventData.length > 0 ? eventData[0] : null
                if (event?.tags) apiMarket.tags = event.tags
              }
            } catch { /* event fetch failed, continue without tags */ }
          }
        }
      }
    } catch {
      console.warn('[ensureMarket] Gamma API failed, trying CLOB')
    }

    if (!apiMarket) {
      apiSource = 'clob'
      try {
        const clobRes = await fetch(
          `https://clob.polymarket.com/markets/${conditionId}`,
          { cache: 'no-store', signal: AbortSignal.timeout(5000) }
        )
        if (clobRes.ok) {
          apiMarket = await clobRes.json()
        }
      } catch { /* CLOB also failed */ }
    }

    if (!apiMarket || !(apiMarket.question || apiMarket.title)) {
      return NextResponse.json(
        { error: 'Market not found in Gamma or CLOB API', found: false, source: 'api_not_found' },
        { status: 404 }
      )
    }

    console.log(`[ensureMarket] Fetched from ${apiSource}:`, {
      question: (apiMarket.question || apiMarket.title)?.substring(0, 50),
      hasTags: Array.isArray(apiMarket.tags) && apiMarket.tags.length > 0,
      tagsLength: Array.isArray(apiMarket.tags) ? apiMarket.tags.length : 0,
    })

    // Step 4: Map to database schema
    const marketRow = mapApiMarketToRow(apiMarket, apiSource)
    const normalizedTags = normalizeTags(marketRow.tags)

    // Infer classification on the server (service role bypasses RLS)
    // PRIMARY: Use semantic_mapping (core semantic engine)
    console.log('[ensureMarket] STEP 5: Inferring niche from tags via semantic_mapping:', normalizedTags)
    const nicheResult = await inferNicheFromTags(normalizedTags)
    console.log('[ensureMarket] STEP 5 RESULT:', {
      niche: nicheResult.niche,
      marketType: nicheResult.marketType,
      source: nicheResult.source,
      fromTag: nicheResult.fromTag,
    })
    let finalNiche = nicheResult.niche
    let finalMarketType = nicheResult.marketType || null
    
    // If semantic_mapping failed, log warning but still try fallback
    // This ensures markets are added to DB even if semantic_mapping table needs population
    if (!finalNiche && normalizedTags.length > 0) {
      console.warn('[ensureMarket] ⚠️ Semantic mapping failed for tags:', normalizedTags, '- using fallback')
      finalNiche = fallbackNicheFromTitle(marketRow.title)
      // Infer market_type from niche if semantic_mapping didn't provide it
      if (!finalMarketType && finalNiche) {
        // Map common niches to types
        const nicheUpper = finalNiche.toUpperCase()
        if (['NBA', 'NFL', 'TENNIS', 'SOCCER', 'SPORTS'].includes(nicheUpper)) {
          finalMarketType = 'SPORTS'
        } else if (['BITCOIN', 'CRYPTO'].includes(nicheUpper)) {
          finalMarketType = 'CRYPTO'
        } else if (['POLITICS', 'ELECTION'].includes(nicheUpper)) {
          finalMarketType = 'POLITICS'
        }
      }
    } else if (!finalNiche) {
      console.warn('[ensureMarket] ⚠️ No tags available for market:', marketRow.condition_id)
      finalNiche = fallbackNicheFromTitle(marketRow.title)
    }
    
    const finalBetStructure = inferBetStructure(marketRow.title) || null
    
    // ALWAYS store tags (required for semantic engine)
    marketRow.tags = normalizedTags
    
    // Store classification
    // Write to both market_subtype AND final_niche (redundancy for compatibility)
    // trader_profile_stats uses final_niche, so we need both
    if (finalMarketType) marketRow.market_type = finalMarketType
    if (finalNiche) {
      marketRow.market_subtype = finalNiche
      marketRow.final_niche = finalNiche // Also populate final_niche for trader_profile_stats compatibility
    }
    if (finalBetStructure) marketRow.bet_structure = finalBetStructure
    
    console.log('[ensureMarket] Classification result:', {
      condition_id: marketRow.condition_id,
      tags: normalizedTags,
      market_type: finalMarketType,
      niche: finalNiche,
      nicheSource: nicheResult.source || 'fallback',
      betStructure: finalBetStructure,
    })

    // Step 5: Upsert to database
    console.log('[ensureMarket] Step 5: Upserting to database')
    const { error: upsertError } = await supabase
      .from('markets')
      .upsert(marketRow, { onConflict: 'condition_id' })

    console.log('[ensureMarket] Upsert result:', {
      hasError: !!upsertError,
      errorMessage: upsertError?.message,
      errorCode: upsertError?.code,
      errorDetails: upsertError?.details,
    })

    if (upsertError) {
      console.error('[ensureMarket] Error upserting market:', {
        error: upsertError,
        message: upsertError.message,
        code: upsertError.code,
        details: upsertError.details,
        hint: upsertError.hint,
      })
      // Still return the CLOB data even if upsert fails
      return NextResponse.json({
        found: true,
        source: apiSource === 'gamma' ? 'gamma_api' : 'clob_api',
        market: {
          market_type: finalMarketType || null,
          market_subtype: finalNiche || null,
          bet_structure: finalBetStructure || null,
          tags: marketRow.tags,
          title: marketRow.title,
        },
        warning: 'Failed to save to database',
        error: upsertError.message
      })
    }

    // Step 6: Re-fetch from database to get any computed fields
    const { data: savedMarket } = await supabase
      .from('markets')
      .select('market_type, market_subtype, final_niche, bet_structure, tags, title')
      .eq('condition_id', conditionId)
      .maybeSingle()

    return NextResponse.json({
      found: true,
      source: existingMarket ? 'database_updated' : `${apiSource}_api_saved`,
      market: savedMarket || {
        market_subtype: null,
        bet_structure: null,
        tags: marketRow.tags,
        title: marketRow.title,
      }
    })

  } catch (error: any) {
    console.error('[ensureMarket] Exception caught:', {
      error,
      message: error?.message,
      stack: error?.stack,
      name: error?.name,
      conditionId,
    })
    return NextResponse.json(
      { 
        error: error?.message || 'Failed to ensure market',
        found: false,
        source: 'exception',
        details: String(error),
      },
      { status: 500 }
    )
  }
}
