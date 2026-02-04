import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Service role client (bypasses RLS)
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
})

// Normalize tags coming from a variety of shapes (JSON string, array of strings, etc.)
function normalizeTags(rawTags: any): string[] {
  if (!rawTags) return []
  if (Array.isArray(rawTags)) {
    return rawTags
      .map((t: any) => (typeof t === 'string' ? t : String(t)))
      .map((t: string) => t.trim())
      .filter((t: string) => t.length > 0)
  }

  if (typeof rawTags === 'string') {
    try {
      const parsed = JSON.parse(rawTags)
      if (Array.isArray(parsed)) {
        return parsed
          .map((t: any) => (typeof t === 'string' ? t : String(t)))
          .map((t: string) => t.trim())
          .filter((t: string) => t.length > 0)
      }
    } catch {
      // Not JSON, treat as a single tag string
    }

    const single = rawTags.trim()
    return single.length > 0 ? [single] : []
  }

  return []
}

// Lightweight bet structure inference (mirrors frontend logic)
function inferBetStructure(title: string | null | undefined): string | null {
  const t = (title || '').toLowerCase()
  if (t.includes('over') || t.includes('under') || t.includes('o/u')) return 'OVER_UNDER'
  if (t.includes('spread') || t.includes('handicap')) return 'SPREAD'
  if (t.includes('will') || t.includes('winner')) return 'WINNER'
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

  console.log('[ensureMarket] Querying semantic_mapping with tags:', cleanTags)

  // Try case-sensitive match first (original_tag should be lowercase)
  let { data: mappings, error } = await supabase
    .from('semantic_mapping')
    .select('clean_niche, type, specificity_score, original_tag')
    .in('original_tag', cleanTags)

  // If no matches and we have tags, try case-insensitive match as fallback
  if ((!mappings || mappings.length === 0) && cleanTags.length > 0) {
    console.log('[ensureMarket] No case-sensitive matches, trying case-insensitive...')
    // Try each tag individually with ilike (case-insensitive)
    for (const tag of cleanTags) {
      const { data: ciMappings, error: ciError } = await supabase
        .from('semantic_mapping')
        .select('clean_niche, type, specificity_score, original_tag')
        .ilike('original_tag', tag)
      
      if (!ciError && ciMappings && ciMappings.length > 0) {
        mappings = (mappings || []).concat(ciMappings)
        console.log('[ensureMarket] Found case-insensitive match for tag:', tag)
        break // Use first match found
      }
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
    console.log('[ensureMarket] ✅ Found semantic mapping:', {
      tag: best?.original_tag,
      niche: cleanNiche,
      type: marketType,
      score: best?.specificity_score,
    })
    return {
      niche: cleanNiche || null,
      marketType: marketType || null,
      source: 'semantic_mapping',
      fromTag: best?.original_tag,
    }
  }

  console.warn('[ensureMarket] ⚠️ No semantic_mapping matches found for tags:', cleanTags)
  return { niche: null, marketType: null, source: 'no_match' }
}

function fallbackNicheFromTitle(title: string | null | undefined): string {
  const t = (title || '').toLowerCase()
  if (t.includes('tennis')) return 'TENNIS'
  if (t.includes('nba') || t.includes('basketball')) return 'NBA'
  if (t.includes('nfl') || t.includes('football')) return 'NFL'
  if (t.includes('politics') || t.includes('election')) return 'POLITICS'
  if (t.includes('crypto') || t.includes('bitcoin')) return 'CRYPTO'
  return 'OTHER'
}

function mapClobMarketToRow(clobMarket: any) {
  const toIsoFromUnix = (seconds: number | null | undefined) => {
    if (!Number.isFinite(seconds)) return null
    return new Date((seconds as number) * 1000).toISOString()
  }

  const row: any = {
    condition_id: clobMarket?.condition_id ?? null,
    title: clobMarket?.question ?? clobMarket?.title ?? null,
    tags: clobMarket?.tags ?? [],
    market_type: null, // Will be populated by classification
    market_subtype: null, // Will be populated by classification
    bet_structure: null, // Will be populated by classification
    volume_total: clobMarket?.volume_total ?? null,
    volume_1_week: clobMarket?.volume_1_week ?? null,
    volume_1_month: clobMarket?.volume_1_month ?? null,
    volume_1_year: clobMarket?.volume_1_year ?? null,
    status: clobMarket?.closed ? 'closed' : clobMarket?.resolved ? 'resolved' : 'open',
    updated_at: new Date().toISOString(),
  }
  
  // Only add category if column exists (check via try/catch or conditional)
  // For now, store category in tags or extra_fields if needed
  if (clobMarket?.category) {
    // Store category in tags array if not already present
    if (Array.isArray(row.tags) && !row.tags.includes(clobMarket.category)) {
      row.tags = [...row.tags, clobMarket.category]
    }
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
      .select('market_type, market_subtype, bet_structure, tags, title')
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
      let finalNiche = (existingMarket.market_subtype || '').trim().toUpperCase() || null
      if (!finalNiche && hasTags) {
        const { niche } = await inferNicheFromTags(tags)
        finalNiche = niche || null
      }
      if (!finalNiche) {
        finalNiche = fallbackNicheFromTitle(existingMarket.title)
      }
      if (!existingMarket.market_subtype && finalNiche) {
        updatedFields.market_subtype = finalNiche
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
            bet_structure: updatedFields.bet_structure || existingMarket.bet_structure || null,
          }
        })
      }

      // Market exists but missing tags - fetch from CLOB to update
      console.log('[ensureMarket] Market exists but missing tags, fetching from CLOB...')
    } else {
      console.log('[ensureMarket] Market not in database, fetching from CLOB...')
    }

    // Step 3: Fetch from CLOB API
    console.log('[ensureMarket] Step 3: Fetching from CLOB API for conditionId:', conditionId)
    const clobUrl = `https://clob.polymarket.com/markets/${conditionId}`
    console.log('[ensureMarket] CLOB URL:', clobUrl)
    
    const clobResponse = await fetch(clobUrl, {
      cache: 'no-store',
    })

    console.log('[ensureMarket] CLOB API response:', {
      ok: clobResponse.ok,
      status: clobResponse.status,
      statusText: clobResponse.statusText,
    })

    if (!clobResponse.ok) {
      const errorText = await clobResponse.text().catch(() => 'Unable to read error')
      console.error('[ensureMarket] CLOB API failed:', {
        status: clobResponse.status,
        statusText: clobResponse.statusText,
        errorText,
      })
      return NextResponse.json(
        { 
          error: `CLOB API returned ${clobResponse.status}`,
          found: false,
          source: 'clob_api_failed',
          details: errorText.substring(0, 200),
        },
        { status: clobResponse.status }
      )
    }

    const clobMarket = await clobResponse.json()
    console.log('[ensureMarket] CLOB market data:', {
      hasData: !!clobMarket,
      hasQuestion: !!clobMarket?.question,
      question: clobMarket?.question?.substring(0, 50),
      hasTags: !!clobMarket?.tags,
      tagsType: typeof clobMarket?.tags,
      tagsIsArray: Array.isArray(clobMarket?.tags),
      tagsLength: Array.isArray(clobMarket?.tags) ? clobMarket.tags.length : 0,
      tags: Array.isArray(clobMarket?.tags) ? clobMarket.tags.slice(0, 5) : clobMarket?.tags,
    })

    if (!clobMarket || !clobMarket.question) {
      console.error('[ensureMarket] Invalid CLOB market data:', {
        hasClobMarket: !!clobMarket,
        hasQuestion: !!clobMarket?.question,
        clobMarketKeys: clobMarket ? Object.keys(clobMarket) : [],
      })
      return NextResponse.json(
        { 
          error: 'Invalid market data from CLOB API',
          found: false,
          source: 'clob_api_invalid'
        },
        { status: 500 }
      )
    }

    // Step 4: Map to database schema
    console.log('[ensureMarket] Step 4: Mapping CLOB data to database schema')
    const marketRow = mapClobMarketToRow(clobMarket)
    const normalizedTags = normalizeTags(marketRow.tags)
    console.log('[ensureMarket] Mapped market row:', {
      condition_id: marketRow.condition_id,
      title: marketRow.title?.substring(0, 50),
      hasTags: normalizedTags.length > 0,
      tagsType: typeof marketRow.tags,
      tagsIsArray: Array.isArray(marketRow.tags),
      tagsLength: normalizedTags.length,
      tags: normalizedTags.slice(0, 5),
    })

    // Infer classification on the server (service role bypasses RLS)
    // PRIMARY: Use semantic_mapping (core semantic engine)
    const nicheResult = await inferNicheFromTags(normalizedTags)
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
    if (finalMarketType) marketRow.market_type = finalMarketType
    if (finalNiche) marketRow.market_subtype = finalNiche
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
        source: 'clob_api',
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
      .select('market_type, market_subtype, bet_structure, tags, title')
      .eq('condition_id', conditionId)
      .maybeSingle()

    return NextResponse.json({
      found: true,
      source: existingMarket ? 'database_updated' : 'clob_api_saved',
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
