// supabase/functions/predict-trade/index.ts
//
// PREDICT-TRADE EDGE FUNCTION - V10 MODEL
// Last Updated: Feb 5, 2026
//
// OBJECTIVE: Provide clear, actionable trade analysis using poly_predictor_v10 model
// with high-value features from comprehensive analysis.
// 
// V10 MODEL FEATURES (27 total):
// - Trader skill: global_win_rate, niche_win_rate_history, total_lifetime_trades
// - Trader behavior: niche_experience_pct, trader_selectivity, price_vs_trader_avg
// - Conviction: conviction_z_score, trade_sequence
// - Behavioral: trader_tempo_seconds, is_chasing_price_up, is_averaging_down
// - V10 NEW: trade_size_tier, trader_sells_ratio, is_hedging, is_in_best_niche, is_with_crowd, market_age_bucket
// - Trade: final_niche, bet_structure, position_direction, entry_price, trade_size_log, total_exposure_log
// - Market: volume_momentum_ratio, liquidity_impact_ratio
// - Timing: minutes_to_start, hours_to_close, market_age_days

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { BigQuery } from "npm:@google-cloud/bigquery@^7.0.0"

// ============================================================================
// DOME API INTEGRATION
// ============================================================================

async function fetchMarketFromDome(conditionId: string): Promise<any | null> {
  const domeApiKey = Deno.env.get("DOME_API_KEY");
  if (!domeApiKey) {
    console.warn("[predict-trade] DOME_API_KEY not set, skipping Dome fetch");
    return null;
  }

  try {
    const url = new URL("https://api.domeapi.io/v1/polymarket/markets");
    url.searchParams.append("condition_id", conditionId);
    url.searchParams.set("limit", "1");

    const headers: Record<string, string> = {
      Accept: "application/json",
      Authorization: `Bearer ${domeApiKey}`,
    };

    const res = await fetch(url.toString(), { headers, cache: "no-store" });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Dome request failed (${res.status}): ${body || res.statusText}`);
    }

    const json = await res.json();
    const markets = Array.isArray(json?.markets) ? json.markets : Array.isArray(json) ? json : [];
    return markets.length > 0 ? markets[0] : null;
  } catch (error) {
    console.error("[predict-trade] Error fetching from Dome API:", error);
    return null;
  }
}

function mapDomeMarketToRow(market: any) {
  const toIsoFromUnix = (seconds: number | null | undefined) => {
    if (!Number.isFinite(seconds)) return null;
    return new Date((seconds as number) * 1000).toISOString();
  };

  const toIsoFromGameStart = (raw: string | null | undefined) => {
    if (!raw || typeof raw !== "string") return null;
    const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
    const withZone = normalized.endsWith("Z") ? normalized : `${normalized}Z`;
    const parsed = new Date(withZone);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  };

  return {
    condition_id: market?.condition_id ?? null,
    market_slug: market?.market_slug ?? null,
    title: market?.title ?? null,
    start_time_unix: Number.isFinite(market?.start_time) ? market.start_time : null,
    end_time_unix: Number.isFinite(market?.end_time) ? market.end_time : null,
    completed_time_unix: Number.isFinite(market?.completed_time) ? market.completed_time : null,
    close_time_unix: Number.isFinite(market?.close_time) ? market.close_time : null,
    game_start_time_raw: market?.game_start_time ?? null,
    start_time: toIsoFromUnix(market?.start_time),
    end_time: toIsoFromUnix(market?.end_time),
    completed_time: toIsoFromUnix(market?.completed_time),
    close_time: toIsoFromUnix(market?.close_time),
    game_start_time: toIsoFromGameStart(market?.game_start_time),
    tags: market?.tags ?? null,
    volume_1_week: market?.volume_1_week ?? null,
    volume_1_month: market?.volume_1_month ?? null,
    volume_1_year: market?.volume_1_year ?? null,
    volume_total: market?.volume_total ?? null,
    resolution_source: market?.resolution_source ?? null,
    image: market?.image ?? null,
    description: market?.description ?? null,
    negative_risk_id: market?.negative_risk_id ?? null,
    side_a: market?.side_a ?? null,
    side_b: market?.side_b ?? null,
    winning_side: market?.winning_side ?? null,
    status: market?.status ?? null,
    extra_fields: market?.extra_fields ?? null,
    raw_dome: market ?? {},
    updated_at: new Date().toISOString(),
  };
}

// ============================================================================
// CLASSIFIER FUNCTIONS
// ============================================================================

function getBetStructure(payloadStructure: string | undefined, title: string): string {
  if (!payloadStructure || payloadStructure === 'null' || payloadStructure === 'undefined') {
    const tLower = (title || '').toLowerCase();
    if (tLower.includes('o/u') || tLower.includes('over/under') || tLower.includes('total')) {
      return 'OVER_UNDER';
    }
    if (tLower.includes('spread') || tLower.includes('handicap')) {
      return 'SPREAD';
    }
    return 'STANDARD';
  }
  return payloadStructure.toUpperCase();
}

async function getMarketClassification(supabase: any, tags: string[], title: string, category?: string | null) {
  const cleanTags = (tags || []).map(t => t.toString().toLowerCase().trim()).filter(t => t.length > 0);
  
  console.log('[getMarketClassification] Input:', {
    tags: cleanTags,
    title: title?.substring(0, 100),
    category: category,
  });
  
  // If we have a category, try to use it first
  if (category && category !== 'OTHER' && category.trim().length > 0) {
    const catLower = category.toLowerCase().trim();
    // Map common categories to niches
    if (catLower.includes('nba') || catLower.includes('basketball')) {
      console.log('[getMarketClassification] Matched NBA from category');
      return { clean_niche: 'NBA', type: 'SPORTS', score: 1 };
    }
    if (catLower.includes('nfl') || catLower.includes('football')) {
      console.log('[getMarketClassification] Matched NFL from category');
      return { clean_niche: 'NFL', type: 'SPORTS', score: 1 };
    }
    if (catLower.includes('politics') || catLower.includes('election')) {
      console.log('[getMarketClassification] Matched POLITICS from category');
      return { clean_niche: 'POLITICS', type: 'POLITICS', score: 1 };
    }
    if (catLower.includes('crypto') || catLower.includes('bitcoin')) {
      console.log('[getMarketClassification] Matched CRYPTO from category');
      return { clean_niche: 'CRYPTO', type: 'CRYPTO', score: 1 };
    }
    if (catLower.includes('tennis')) {
      console.log('[getMarketClassification] Matched TENNIS from category');
      return { clean_niche: 'TENNIS', type: 'SPORTS', score: 1 };
    }
    if (catLower.includes('soccer') || catLower.includes('football')) {
      console.log('[getMarketClassification] Matched SOCCER from category');
      return { clean_niche: 'SOCCER', type: 'SPORTS', score: 1 };
    }
  }
  
  if (cleanTags.length === 0) {
    const tLower = (title || '').toLowerCase();
    if (tLower.includes('lakers') || tLower.includes('warriors') || tLower.includes('nba') ||
        (tLower.includes('vs.') && tLower.includes('o/u'))) {
      console.log('[getMarketClassification] Matched NBA from title');
      return { clean_niche: 'NBA', type: 'SPORTS', score: 1 };
    }
    if (tLower.includes('trump') || tLower.includes('biden')) {
      console.log('[getMarketClassification] Matched POLITICS from title');
      return { clean_niche: 'POLITICS', type: 'POLITICS', score: 1 };
    }
    if (tLower.includes('bitcoin') || tLower.includes('btc')) {
      console.log('[getMarketClassification] Matched BITCOIN from title');
      return { clean_niche: 'BITCOIN', type: 'CRYPTO', score: 1 };
    }
    if (tLower.includes('crypto') || tLower.includes('ethereum')) {
      console.log('[getMarketClassification] Matched CRYPTO from title');
      return { clean_niche: 'CRYPTO', type: 'CRYPTO', score: 1 };
    }
    if (tLower.includes('tennis')) {
      console.log('[getMarketClassification] Matched TENNIS from title');
      return { clean_niche: 'TENNIS', type: 'SPORTS', score: 1 };
    }
    if (tLower.includes('vs.') || tLower.includes('versus')) {
      console.log('[getMarketClassification] Matched SPORTS from title');
      return { clean_niche: 'SPORTS', type: 'SPORTS', score: 2 };
    }
    console.log('[getMarketClassification] No match found, returning OTHER');
    return { clean_niche: 'OTHER', type: 'OTHER', score: 99 };
  }
  
  let mappings: any[] = [];
  const { data, error } = await supabase
    .from('semantic_mapping')
    .select('*')
    .in('original_tag', cleanTags);
  
  if (!error && data) {
    mappings = data;
  }

  let bestMatch = { clean_niche: 'OTHER', type: 'OTHER', score: 99 };

  if (mappings && mappings.length > 0) {
    mappings.sort((a: any, b: any) => (a.specificity_score || 99) - (b.specificity_score || 99));
    bestMatch = {
      clean_niche: mappings[0].clean_niche || 'OTHER',
      type: mappings[0].type || 'OTHER',
      score: mappings[0].specificity_score || 99
    };
  }

  // If still OTHER, try title keywords
  if (bestMatch.clean_niche === 'OTHER') {
    const tLower = (title || '').toLowerCase();
    if (tLower.includes('lakers') || tLower.includes('warriors') || tLower.includes('nba') ||
        (tLower.includes('vs.') && tLower.includes('o/u'))) {
      console.log('[getMarketClassification] Matched NBA from title fallback');
      return { clean_niche: 'NBA', type: 'SPORTS', score: 1 };
    }
    if (tLower.includes('trump') || tLower.includes('biden')) {
      console.log('[getMarketClassification] Matched POLITICS from title fallback');
      return { clean_niche: 'POLITICS', type: 'POLITICS', score: 1 };
    }
    if (tLower.includes('bitcoin') || tLower.includes('btc')) {
      console.log('[getMarketClassification] Matched BITCOIN from title fallback');
      return { clean_niche: 'BITCOIN', type: 'CRYPTO', score: 1 };
    }
    if (tLower.includes('crypto') || tLower.includes('ethereum')) {
      console.log('[getMarketClassification] Matched CRYPTO from title fallback');
      return { clean_niche: 'CRYPTO', type: 'CRYPTO', score: 1 };
    }
    if (tLower.includes('tennis')) {
      console.log('[getMarketClassification] Matched TENNIS from title fallback');
      return { clean_niche: 'TENNIS', type: 'SPORTS', score: 1 };
    }
    if (tLower.includes('vs.') || tLower.includes('versus')) {
      console.log('[getMarketClassification] Matched SPORTS from title fallback');
      return { clean_niche: 'SPORTS', type: 'SPORTS', score: 2 };
    }
  }

  console.log('[getMarketClassification] Final result:', bestMatch);
  return bestMatch;
}

function parseDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  try {
    const parsed = new Date(dateStr);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  } catch {
    return null;
  }
}

// ============================================================================
// WATERFALL LOGIC HELPER FUNCTION
// ============================================================================

interface ProfileStatsResult {
  win_rate: number;
  roi_pct: number;
  trade_count: number;
  data_source: string;
  trade_profile?: string;
}

function getProfileStats(
  profiles: any[],
  niche: string,
  structure: string,
  priceBracket: string,
  globalStats: any
): ProfileStatsResult {
  const MIN_TRADES = 5;
  
  // Default fallback to global stats
  const defaultResult: ProfileStatsResult = {
    win_rate: typeof globalStats.global_win_rate === 'number' && !isNaN(globalStats.global_win_rate)
      ? globalStats.global_win_rate
      : 0.5,
    roi_pct: typeof globalStats.global_roi_pct === 'number' && !isNaN(globalStats.global_roi_pct)
      ? globalStats.global_roi_pct
      : 0,
    trade_count: typeof globalStats.total_lifetime_trades === 'number' ? globalStats.total_lifetime_trades : 0,
    data_source: 'Global Fallback',
    trade_profile: `${niche}_${structure}_${priceBracket}`, // Always set trade_profile even for fallback
  };

  if (!profiles || profiles.length === 0) {
    return defaultResult;
  }

  // Level 1: Most Specific - [niche + structure + price_bracket]
  // Handle both 'bet_structure' and 'structure' column names, and 'price_bracket' and 'bracket'
  const level1Matches = profiles.filter((p: any) => 
    p.final_niche === niche && 
    (p.bet_structure === structure || p.structure === structure) && 
    (p.price_bracket === priceBracket || p.bracket === priceBracket)
  );
  
  if (level1Matches.length > 0) {
    const match = level1Matches[0];
    // Handle both 'trade_count' and 'l_count' column names (case-insensitive)
    const tradeCount = typeof match.trade_count === 'number' ? match.trade_count : 
                      (typeof match.l_count === 'number' ? match.l_count : 
                      (typeof match.L_count === 'number' ? match.L_count : 0));
    if (tradeCount >= MIN_TRADES) {
      // Handle both 'win_rate' and 'l_win_rate' (case-insensitive)
      const winRate = typeof match.win_rate === 'number' && !isNaN(match.win_rate) ? match.win_rate :
                      (typeof match.l_win_rate === 'number' && !isNaN(match.l_win_rate) ? match.l_win_rate :
                      (typeof match.L_win_rate === 'number' && !isNaN(match.L_win_rate) ? match.L_win_rate : defaultResult.win_rate));
      // Handle both 'roi_pct' and 'l_roi_pct' (case-insensitive)
      const roiPct = typeof match.roi_pct === 'number' && !isNaN(match.roi_pct) ? match.roi_pct :
                     (typeof match.l_roi_pct === 'number' && !isNaN(match.l_roi_pct) ? match.l_roi_pct :
                     (typeof match.L_roi_pct === 'number' && !isNaN(match.L_roi_pct) ? match.L_roi_pct :
                     (typeof match.l_total_roi_pct === 'number' && !isNaN(match.l_total_roi_pct) ? match.l_total_roi_pct :
                     (typeof match.L_total_roi_pct === 'number' && !isNaN(match.L_total_roi_pct) ? match.L_total_roi_pct : defaultResult.roi_pct))));
      return {
        win_rate: winRate,
        roi_pct: roiPct,
        trade_count: tradeCount,
        data_source: 'Specific Profile',
        trade_profile: `${niche}_${structure}_${priceBracket}`,
      };
    }
  }

  // Level 2: Structure-Specific - [niche + structure]
  const level2Matches = profiles.filter((p: any) => 
    p.final_niche === niche && 
    (p.bet_structure === structure || p.structure === structure)
  );
  
  if (level2Matches.length > 0) {
    const aggregated = aggregateProfileStats(level2Matches);
    if (aggregated.trade_count >= MIN_TRADES) {
      return {
        ...aggregated,
        data_source: 'Structure-Specific',
        trade_profile: `${niche}_${structure}`,
      };
    }
  }

  // Level 3: Niche-Specific - [niche]
  const level3Matches = profiles.filter((p: any) => p.final_niche === niche);
  
  if (level3Matches.length > 0) {
    const aggregated = aggregateProfileStats(level3Matches);
    if (aggregated.trade_count >= MIN_TRADES) {
      return {
        ...aggregated,
        data_source: 'Niche-Specific',
        trade_profile: niche,
      };
    }
  }

  // Level 4: Global Fallback
  return defaultResult;
}

function aggregateProfileStats(profiles: any[]): ProfileStatsResult {
  let totalTrades = 0;
  let totalWins = 0;
  let totalRoi = 0;
  let validRoiCount = 0;

  profiles.forEach((p: any) => {
    // Handle both 'trade_count' and 'l_count' column names (case-insensitive)
    const tradeCount = typeof p.trade_count === 'number' ? p.trade_count : 
                      (typeof p.l_count === 'number' ? p.l_count : 
                      (typeof p.L_count === 'number' ? p.L_count : 0));
    // Handle both 'win_rate' and 'l_win_rate' column names (case-insensitive)
    const winRate = typeof p.win_rate === 'number' && !isNaN(p.win_rate) ? p.win_rate : 
                    (typeof p.l_win_rate === 'number' && !isNaN(p.l_win_rate) ? p.l_win_rate :
                    (typeof p.L_win_rate === 'number' && !isNaN(p.L_win_rate) ? p.L_win_rate : 0));
    // Handle both 'roi_pct' and 'l_roi_pct' column names (case-insensitive)
    const roiPct = typeof p.roi_pct === 'number' && !isNaN(p.roi_pct) ? p.roi_pct : 
                   (typeof p.l_roi_pct === 'number' && !isNaN(p.l_roi_pct) ? p.l_roi_pct :
                   (typeof p.L_roi_pct === 'number' && !isNaN(p.L_roi_pct) ? p.L_roi_pct :
                   (typeof p.l_total_roi_pct === 'number' && !isNaN(p.l_total_roi_pct) ? p.l_total_roi_pct :
                   (typeof p.L_total_roi_pct === 'number' && !isNaN(p.L_total_roi_pct) ? p.L_total_roi_pct : 0))));

    totalTrades += tradeCount;
    totalWins += tradeCount * winRate;
    
    if (roiPct !== 0 || tradeCount > 0) {
      totalRoi += roiPct * tradeCount; // Weight ROI by trade count
      validRoiCount += tradeCount;
    }
  });

  const aggregatedWinRate = totalTrades > 0 ? totalWins / totalTrades : 0.5;
  const aggregatedRoi = validRoiCount > 0 ? totalRoi / validRoiCount : 0;

  return {
    win_rate: aggregatedWinRate,
    roi_pct: aggregatedRoi,
    trade_count: totalTrades,
    data_source: 'Aggregated',
  };
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const trader = body.original_trade
    const marketContext = body.market_context || {}
    const otherTrades = body.other_trades || []
    const hedgingInfo = body.hedging_info || null
    
    // Normalize market data - handle both naming conventions
    const market = {
      ...marketContext,
      // Handle both 'title' and 'market_title'
      title: marketContext.title || marketContext.market_title || '',
      // Handle both 'tags' and 'market_tags' (can be string or array)
      tags: (() => {
        const tags = marketContext.tags || marketContext.market_tags;
        if (!tags) return [];
        if (Array.isArray(tags)) return tags;
        if (typeof tags === 'string') {
          try {
            return JSON.parse(tags);
          } catch {
            return [tags];
          }
        }
        return [];
      })(),
      // Handle both 'category' and 'market_category'
      category: marketContext.category || marketContext.market_category || null,
      // Handle both 'betStructure' and 'market_bet_structure'
      betStructure: marketContext.betStructure || marketContext.market_bet_structure || null,
      // Preserve other fields
      current_price: marketContext.current_price,
      current_timestamp: marketContext.current_timestamp,
      volumeTotal: marketContext.volumeTotal || marketContext.volume_total,
      volume1Week: marketContext.volume1Week || marketContext.volume_1_week,
      startTime: marketContext.startTime || marketContext.start_time_unix,
      endTime: marketContext.endTime || marketContext.end_time_unix,
      gameStartTime: marketContext.gameStartTime || marketContext.game_start_time,
    }

    // Support both old format (trader.wallet, trader.condition_id) and new format (wallet_address, condition_id)
    const walletAddress = trader?.wallet_address || trader?.wallet
    const conditionId = trader?.condition_id
    const price = trader?.price
    const size = trader?.shares_normalized || trader?.size

    if (!trader || !walletAddress || !conditionId) {
      return new Response(JSON.stringify({ error: 'Missing required fields: original_trade.wallet_address (or wallet) and original_trade.condition_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (!price || !size) {
      return new Response(JSON.stringify({ error: 'Missing required fields: original_trade.price and original_trade.shares_normalized (or size)' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Initialize BigQuery
    const serviceAccountJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')
    if (!serviceAccountJson) {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON environment variable is required')
    }
    
    const serviceAccount = JSON.parse(serviceAccountJson)
    const bqClient = new BigQuery({
      projectId: serviceAccount.project_id,
      credentials: serviceAccount,
    })

    const wallet = walletAddress.toLowerCase();
    const tradeTotal = price * size;
    const now = new Date();
    const nowMs = now.getTime();
    
    // ============================================================================
    // STEP 1: FETCH MARKET DATA FROM DATABASE
    // ============================================================================
    
    // Fetch market data with classification fields from database
    let marketData: any = null;
    if (conditionId) {
      // Try to fetch market data - handle both cases: with and without classification columns
      const { data, error } = await supabase
        .from('markets')
        .select('tags, start_time_unix, end_time_unix, game_start_time, volume_total, volume_1_week, title, category')
        .eq('condition_id', conditionId)
        .maybeSingle();
      
      // Set marketData from initial query
      if (!error && data) {
        marketData = data;
        
        // Try to fetch classification columns if they exist (they may not be in the schema)
        // We'll handle missing columns gracefully in the classification logic below
        try {
          const { data: classificationData, error: classificationError } = await supabase
            .from('markets')
            .select('market_type, market_subtype, bet_structure')
            .eq('condition_id', conditionId)
            .maybeSingle();
          
          // If no error and we got data, merge it
          if (!classificationError && classificationData) {
            marketData = { ...marketData, ...classificationData };
            console.log('[predict-trade] Found classification columns:', {
              market_subtype: classificationData.market_subtype,
              bet_structure: classificationData.bet_structure,
            });
          } else if (classificationError) {
            // Columns don't exist - this is fine, we'll use fallback logic
            console.log('[predict-trade] Classification columns not available (may not exist in schema), using fallback');
          }
        } catch (classificationError: any) {
          // Columns don't exist, use data without classification fields
          console.log('[predict-trade] Classification columns query failed (columns may not exist):', classificationError?.message);
        }
      } else if (error) {
        console.error('[predict-trade] Error fetching market:', error);
      }
      
      // If market not in DB, fetch from Dome and upsert
      if (!marketData) {
        const domeMarket = await fetchMarketFromDome(conditionId);
        if (domeMarket) {
          const marketRow = mapDomeMarketToRow(domeMarket);
          await supabase.from('markets').upsert(marketRow, { onConflict: 'condition_id' });
          marketData = marketRow;
        }
      }
      
      // Update market object with fetched data
      if (marketData) {
        if (marketData.tags) market.tags = Array.isArray(marketData.tags) ? marketData.tags : [];
        if (marketData.game_start_time) market.gameStartTime = marketData.game_start_time;
        if (marketData.start_time_unix) market.startTime = marketData.start_time_unix;
        if (marketData.end_time_unix) market.endTime = marketData.end_time_unix;
        if (marketData.volume_total !== null) market.volumeTotal = marketData.volume_total;
        if (marketData.volume_1_week !== null) market.volume1Week = marketData.volume_1_week;
        if (marketData.title) market.title = marketData.title;
        if (marketData.category) market.category = marketData.category;
      }
    }

    // ============================================================================
    // STEP 2: RESOLVE NICHE AND BET STRUCTURE FROM DATABASE
    // ============================================================================
    
    // Use market_subtype from database as niche (this is the primary source)
    let finalNiche: string | null = null;
    
    // Check if market_subtype exists and is valid
    if (marketData?.market_subtype && typeof marketData.market_subtype === 'string' && marketData.market_subtype.trim().length > 0) {
      finalNiche = marketData.market_subtype.trim().toUpperCase();
      console.log('[predict-trade] Using market_subtype from database:', finalNiche);
    }
    
    // If market_subtype not set, use semantic_mapping as fallback
    if (!finalNiche) {
      const tags = marketData?.tags || market.tags || [];
      const cleanTags = Array.isArray(tags) 
        ? tags.map((t: any) => {
            const tagStr = typeof t === 'string' ? t : String(t);
            return tagStr.toLowerCase().trim();
          }).filter((t: string) => t.length > 0)
        : [];
      
      console.log('[predict-trade] market_subtype not found, trying semantic_mapping with tags:', cleanTags);
      
      if (cleanTags.length > 0) {
        const { data: mappings, error: mappingError } = await supabase
          .from('semantic_mapping')
          .select('clean_niche, type, specificity_score')
          .in('original_tag', cleanTags);
        
        if (mappingError) {
          console.error('[predict-trade] Error querying semantic_mapping:', mappingError);
        }
        
        if (mappings && mappings.length > 0) {
          mappings.sort((a: any, b: any) => (a.specificity_score || 99) - (b.specificity_score || 99));
          finalNiche = mappings[0].clean_niche || null;
          console.log('[predict-trade] Found niche from semantic_mapping:', finalNiche);
        }
      }
    }
    
    // Final fallback to category or title keywords
    if (!finalNiche) {
      if (marketData?.category && typeof marketData.category === 'string' && marketData.category !== 'OTHER' && marketData.category.trim().length > 0) {
        finalNiche = marketData.category.trim().toUpperCase();
        console.log('[predict-trade] Using category as fallback:', finalNiche);
      } else {
        const titleLower = (marketData?.title || market.title || '').toLowerCase();
        if (titleLower.includes('tennis')) finalNiche = 'TENNIS';
        else if (titleLower.includes('nba') || titleLower.includes('basketball')) finalNiche = 'NBA';
        else if (titleLower.includes('nfl') || titleLower.includes('football')) finalNiche = 'NFL';
        else if (titleLower.includes('politics') || titleLower.includes('election')) finalNiche = 'POLITICS';
        else if (titleLower.includes('crypto') || titleLower.includes('bitcoin')) finalNiche = 'CRYPTO';
        else finalNiche = 'OTHER';
        console.log('[predict-trade] Using title keywords as fallback:', finalNiche);
      }
    }
    
    // Ensure finalNiche is never null/undefined
    if (!finalNiche || finalNiche === 'null') {
      finalNiche = 'OTHER';
      console.log('[predict-trade] Final fallback to OTHER');
    }

    // Use bet_structure from database (primary source)
    let betStructure: string | null = null;
    
    // Check if bet_structure exists and is valid
    if (marketData?.bet_structure && typeof marketData.bet_structure === 'string' && marketData.bet_structure.trim().length > 0) {
      betStructure = marketData.bet_structure.trim().toUpperCase();
      console.log('[predict-trade] Using bet_structure from database:', betStructure);
    }
    
    // Fallback to getBetStructure function if not in DB
    if (!betStructure) {
      betStructure = getBetStructure(market.betStructure || marketContext.market_bet_structure, marketData?.title || market.title || '') || 'STANDARD';
      console.log('[predict-trade] Using getBetStructure fallback:', betStructure);
    }
    
    // Ensure betStructure is never null/undefined
    if (!betStructure || betStructure.trim().length === 0) {
      betStructure = 'STANDARD';
      console.log('[predict-trade] Final fallback betStructure to STANDARD');
    }

    // ============================================================================
    // STEP 3: FETCH TRADER STATS
    // ============================================================================
    
    // Fetch Global Stats and Profile Stats in parallel
    const [globalStatsRes, profileStatsRes] = await Promise.all([
      supabase.from('trader_global_stats').select('*').eq('wallet_address', wallet).maybeSingle(),
      supabase.from('trader_profile_stats').select('*').eq('wallet_address', wallet)
    ]);
    
    console.log('[predict-trade] Data fetch results:', {
      marketData: {
        market_subtype: marketData?.market_subtype,
        bet_structure: marketData?.bet_structure,
        category: marketData?.category,
        title: marketData?.title?.substring(0, 100),
        tags: marketData?.tags,
      },
      resolved: {
        finalNiche,
        betStructure,
      },
      globalStatsFound: !!globalStatsRes.data,
      profileStatsCount: profileStatsRes.data?.length || 0,
    });
    const entryPrice = price;
    
    // Determine price bracket (matches training data: LOW < 0.35, MID 0.35-0.65, HIGH > 0.65)
    let priceBracket = 'MID';
    if (entryPrice < 0.35) priceBracket = 'LOW';
    else if (entryPrice > 0.65) priceBracket = 'HIGH';

    // Global stats with fallbacks
    const globalStats = globalStatsRes.data || {
      wallet_address: wallet,
      global_win_rate: 0.5,
      global_roi_pct: 0,
      total_lifetime_trades: 0,
      avg_bet_size_usdc: tradeTotal,
      stddev_bet_size_usdc: 0,
      recent_win_rate: 0.5,
      last_updated: now.toISOString()
    };

    // Profile stats array
    const profileStats = profileStatsRes.data || [];

    // ============================================================================
    // WATERFALL LOGIC: Find best matching profile stats
    // ============================================================================
    
    console.log('[predict-trade] Classification inputs:', {
      finalNiche,
      betStructure,
      priceBracket,
      entryPrice,
      profileStatsCount: profileStats?.length || 0,
      globalStatsExists: !!globalStatsRes.data,
      marketTags: market.tags,
      marketTitle: market.title,
      marketCategory: market.category,
    });
    
    const profileResult = getProfileStats(profileStats, finalNiche, betStructure, priceBracket, globalStats);
    
    // Ensure trade_profile is always set (even if using global fallback)
    // Make sure all components are valid strings
    const safeFinalNiche = (finalNiche || 'OTHER').trim();
    const safeBetStructure = (betStructure || 'STANDARD').trim();
    const safePriceBracket = (priceBracket || 'MID').trim();
    const tradeProfile = profileResult.trade_profile || `${safeFinalNiche}_${safeBetStructure}_${safePriceBracket}`;
    
    console.log('[predict-trade] Profile Result:', {
      trade_profile: tradeProfile,
      data_source: profileResult.data_source,
      trade_count: profileResult.trade_count,
      win_rate: profileResult.win_rate,
      roi_pct: profileResult.roi_pct,
      components: {
        finalNiche: safeFinalNiche,
        betStructure: safeBetStructure,
        priceBracket: safePriceBracket,
      },
    });
    
    // Extract stats from waterfall result
    const dna_avg = typeof globalStats.avg_bet_size_usdc === 'number' ? globalStats.avg_bet_size_usdc : tradeTotal;
    const dna_stddev = typeof globalStats.stddev_bet_size_usdc === 'number' ? globalStats.stddev_bet_size_usdc : 0;
    const dna_global_win_rate = typeof globalStats.global_win_rate === 'number' && !isNaN(globalStats.global_win_rate) 
      ? globalStats.global_win_rate 
      : 0.5;
    const dna_recent_win_rate = typeof globalStats.recent_win_rate === 'number' && !isNaN(globalStats.recent_win_rate)
      ? globalStats.recent_win_rate
      : dna_global_win_rate;
    const dna_trades = typeof globalStats.total_lifetime_trades === 'number' ? globalStats.total_lifetime_trades : 0;
    
    // Use profile stats if available, otherwise fall back to global
    const niche_win_rate = profileResult.win_rate;
    const trader_historical_roi_pct = profileResult.roi_pct;
    
    // Calculate z_score
    const z_score = dna_stddev > 0.5 
      ? Math.min(Math.max((tradeTotal - dna_avg) / dna_stddev, -10), 10)
      : 0;
    
    // ============================================================================
    // STEP 2: POPULATE TACTICAL DATA
    // ============================================================================
    
    // Calculate minutes_to_start
    const gameStart = parseDate(market.gameStartTime);
    const gameStartMs = gameStart ? gameStart.getTime() : nowMs;
    const minutes_to_start = gameStart ? Math.floor((gameStartMs - nowMs) / 60000) : 0;
    
    // Calculate trade_sequence
    const trade_sequence = otherTrades.length + 1;
    
    // Calculate is_averaging_down (currentPrice < averageEntryPrice)
    let is_averaging_down = false;
    let averageEntryPrice = 0;
    if (Array.isArray(otherTrades) && otherTrades.length > 0) {
      const prices = otherTrades
        .map((t: any) => typeof t.price === 'number' ? t.price : null)
        .filter((p: number | null) => p !== null) as number[];
      if (prices.length > 0) {
        averageEntryPrice = prices.reduce((sum, p) => sum + p, 0) / prices.length;
        is_averaging_down = price < averageEntryPrice;
      }
    }
    
    // Calculate tempo (seconds since last trade)
    let tempo = 0;
    if (Array.isArray(otherTrades) && otherTrades.length > 0) {
      const sortedTrades = [...otherTrades].sort((a: any, b: any) => {
        const aTime = a.timestamp ? new Date(a.timestamp).getTime() : (a.created_at ? new Date(a.created_at).getTime() : 0);
        const bTime = b.timestamp ? new Date(b.timestamp).getTime() : (b.created_at ? new Date(b.created_at).getTime() : 0);
        return bTime - aTime;
      });
      const lastTradeTime = sortedTrades[0]?.timestamp 
        ? new Date(sortedTrades[0].timestamp).getTime() 
        : (sortedTrades[0]?.created_at ? new Date(sortedTrades[0].created_at).getTime() : nowMs);
      tempo = Math.floor((nowMs - lastTradeTime) / 1000);
    } else {
      const lastGlobalTradeMs = globalStats.last_updated ? new Date(globalStats.last_updated).getTime() : nowMs;
      tempo = Math.floor((nowMs - lastGlobalTradeMs) / 1000);
    }
    
    // Calculate exposure (sum of all trades + current trade)
    const exposure = otherTrades.reduce((sum: number, t: any) => {
      const tPrice = typeof t.price === 'number' ? t.price : 0;
      const tSize = typeof t.size === 'number' ? t.size : (typeof t.shares_normalized === 'number' ? t.shares_normalized : 0);
      return sum + (tPrice * tSize);
    }, 0) + tradeTotal;

    // ============================================================================
    // BIGQUERY ML PREDICTION
    // ============================================================================
    
    // Determine position direction from side or tokenLabel
    const side = trader?.side || trader?.tokenLabel;
    const positionDirection = (side === 'SELL' || side === 'No') ? 'SHORT' : 'LONG';
    
    // Calculate features for BigQuery
    const tradeSizeLog = Math.log(tradeTotal + 1);
    const totalExposureLog = Math.log(exposure + 1);
    const is_chasing = price > (otherTrades.length > 0 ? (otherTrades[0]?.price || 0) : 0) ? 1 : 0;
    const is_avg_down_num = is_averaging_down ? 1 : 0;
    
    // Market volume metrics (used for both BigQuery and slippage)
    const volTotal = parseFloat(String(market.volumeTotal || 1000));
    const volWeek = parseFloat(String(market.volume1Week || 0));
    const volumeMomentumRatio = volWeek / Math.max(volTotal, 1);
    const liquidityImpactRatio = tradeTotal / Math.max(volTotal, tradeTotal, 1000);
    
    const marketStart = parseDate(market.startTime);
    const marketEnd = parseDate(market.endTime);
    const marketStartMs = marketStart ? marketStart.getTime() : nowMs;
    const marketEndMs = marketEnd ? marketEnd.getTime() : (nowMs + 86400000);
    const hoursToClose = marketEnd ? Math.floor((marketEndMs - nowMs) / 3600000) : 24;
    const marketAgeDays = marketStart ? Math.floor((nowMs - marketStartMs) / 86400000) : 0;
    const isHedged = hedgingInfo?.isHedging === true ? 1 : 0;
    
    // Calculate V10 model features
    
    // trade_size_tier based on liquidity impact ratio
    const trade_size_tier = liquidityImpactRatio > 0.01 ? 'WHALE'
      : liquidityImpactRatio > 0.001 ? 'LARGE'
      : liquidityImpactRatio > 0.0001 ? 'MEDIUM'
      : 'SMALL';
    
    // trader_sells_ratio - from global stats if available, else default to 0
    const trader_sells_ratio = typeof globalStats.sells_ratio === 'number' 
      ? globalStats.sells_ratio 
      : 0;
    
    // is_hedging - from hedgingInfo passed in payload
    const is_hedging = hedgingInfo?.isHedging === true ? 1 : 0;
    
    // is_in_best_niche - check if trader's best niche matches current trade
    // First, find trader's best niche from profile stats
    let trader_best_niche = 'OTHER';
    if (profileStats && profileStats.length > 0) {
      // Sort by win rate and trade count to find best niche
      const sortedProfiles = [...profileStats]
        .filter((p: any) => (p.L_count || p.l_count || p.trade_count || 0) >= 10)
        .sort((a: any, b: any) => {
          const aWR = a.L_win_rate || a.l_win_rate || a.win_rate || 0;
          const bWR = b.L_win_rate || b.l_win_rate || b.win_rate || 0;
          return bWR - aWR;
        });
      if (sortedProfiles.length > 0) {
        trader_best_niche = sortedProfiles[0].final_niche || 'OTHER';
      }
    }
    const is_in_best_niche = finalNiche === trader_best_niche ? 1 : 0;
    
    // is_with_crowd - determine if trade aligns with volume direction
    // Heuristic: if price > 0.5, assume "YES" is popular; check if trader is buying YES
    // This is an approximation since we don't have real-time volume direction
    const is_with_crowd = (entryPrice > 0.5 && positionDirection === 'LONG') || 
                         (entryPrice <= 0.5 && positionDirection === 'SHORT') ? 1 : 0;
    
    // market_age_bucket
    const market_age_bucket = marketAgeDays < 1 ? 'DAY_1'
      : marketAgeDays < 7 ? 'WEEK_1'
      : marketAgeDays < 30 ? 'MONTH_1'
      : 'OLDER';
    
    // niche_experience_pct - what % of trader's trades are in this niche
    let niche_experience_pct = 0;
    if (profileStats && profileStats.length > 0) {
      const nicheProfile = profileStats.find((p: any) => p.final_niche === finalNiche);
      const nicheCount = nicheProfile?.L_count || nicheProfile?.l_count || nicheProfile?.trade_count || 0;
      const totalCount = profileStats.reduce((sum: number, p: any) => {
        return sum + (p.L_count || p.l_count || p.trade_count || 0);
      }, 0);
      niche_experience_pct = totalCount > 0 ? nicheCount / totalCount : 0;
    }
    
    // trader_selectivity - inverse of trades per day (approximation)
    const trader_selectivity = dna_trades > 0 ? Math.min(1.0 / Math.max(dna_trades / 30, 0.1), 1.0) : 0.5;
    
    // price_vs_trader_avg - normalized entry price vs trader's historical average
    const trader_avg_entry_price = typeof globalStats.avg_entry_price === 'number' 
      ? globalStats.avg_entry_price 
      : 0.5;
    const price_vs_trader_avg = (entryPrice - trader_avg_entry_price) / 0.2;
    
    // BigQuery query with COALESCE for all inputs - V10 MODEL
    const query = `
      SELECT * FROM ML.PREDICT(MODEL \`polycopy_v1.poly_predictor_v10\`, 
      (
        SELECT 
          -- Trader skill features (core)
          COALESCE(${dna_global_win_rate}, 0.5) as global_win_rate,
          COALESCE(${niche_win_rate}, ${dna_global_win_rate}, 0.5) as niche_win_rate_history,
          COALESCE(${dna_trades}, 0) as total_lifetime_trades,
          
          -- Trader behavior features (V9)
          COALESCE(${niche_experience_pct}, 0) as niche_experience_pct,
          COALESCE(${trader_selectivity}, 0.5) as trader_selectivity,
          COALESCE(${price_vs_trader_avg}, 0) as price_vs_trader_avg,
          
          -- Conviction features
          COALESCE(${z_score}, 0) as conviction_z_score,
          COALESCE(${trade_sequence}, 1) as trade_sequence,
          
          -- Behavioral features
          COALESCE(${tempo}, 300) as trader_tempo_seconds,
          COALESCE(${is_chasing}, 0) as is_chasing_price_up,
          COALESCE(${is_avg_down_num}, 0) as is_averaging_down,
          
          -- V10 NEW FEATURES
          '${trade_size_tier}' as trade_size_tier,
          COALESCE(${trader_sells_ratio}, 0) as trader_sells_ratio,
          COALESCE(${is_hedging}, 0) as is_hedging,
          COALESCE(${is_in_best_niche}, 0) as is_in_best_niche,
          COALESCE(${is_with_crowd}, 0) as is_with_crowd,
          '${market_age_bucket}' as market_age_bucket,
          
          -- Trade features
          COALESCE('${finalNiche}', 'OTHER') as final_niche,
          COALESCE('${betStructure}', 'STANDARD') as bet_structure,
          COALESCE('${positionDirection}', 'LONG') as position_direction,
          COALESCE(${entryPrice}, 0.5) as entry_price,
          COALESCE(LOG(${tradeTotal} + 1), 0) as trade_size_log,
          COALESCE(LOG(${exposure} + 1), 0) as total_exposure_log,
          
          -- Market features
          COALESCE(${volumeMomentumRatio}, 0) as volume_momentum_ratio,
          COALESCE(${liquidityImpactRatio}, 0) as liquidity_impact_ratio,
          
          -- Timing features
          COALESCE(${minutes_to_start}, 0) as minutes_to_start,
          COALESCE(${hoursToClose}, 24) as hours_to_close,
          COALESCE(${marketAgeDays}, 0) as market_age_days
      ))
    `;

    // Get winProb from BigQuery
    let winProb = 0.5;
    try {
      const [job] = await bqClient.createQueryJob({ query });
      const [rows] = await job.getQueryResults();
      
      if (rows && rows.length > 0 && rows[0].predicted_outcome_probs) {
        const p = rows[0].predicted_outcome_probs.find((p: any) => p.label === 'WON');
        if (p) winProb = p.prob;
      }
    } catch (bqError: any) {
      console.error('[predict-trade] BigQuery ML.PREDICT failed:', bqError);
      winProb = 0.5;
    }

    // ============================================================================
    // STEP 3: ESTIMATE REAL-TIME SLIPPAGE & EFFECTIVE PRICE
    // ============================================================================
    
    // Get user's max slippage setting (default to 5% if not provided)
    const userMaxSlippage = typeof body.user_slippage === 'number' && body.user_slippage > 0
      ? body.user_slippage / 100  // Convert from percentage to decimal
      : 0.05; // Default 5%
    
    // Calculate market impact (volTotal already calculated above for BigQuery features)
    const impact = tradeTotal / Math.max(volTotal, 1000);
    
    // Estimate slippage percentage (heuristic: 0.3x impact factor)
    let estimated_slippage_pct = impact * 0.3;
    
    // Clamp between 0.001 (0.1%) and user's max slippage
    estimated_slippage_pct = Math.max(0.001, Math.min(estimated_slippage_pct, userMaxSlippage));
    
    // Calculate effective entry price (with slippage)
    const spot_price = entryPrice;
    const effective_price = entryPrice * (1 + estimated_slippage_pct);
    
    // Calculate real edge using effective price
    const real_edge_pct = effective_price > 0 ? ((winProb / effective_price) - 1) * 100 : 0;
    
    // ============================================================================
    // STEP 4: THE HOUSE PLAY (Kelly Criterion for $4,000 bankroll)
    // ============================================================================
    
    const HOUSE_BANKROLL = 4000;
    const KELLY_FRACTION = 0.25; // Use 25% of Kelly to be conservative
    
    // Calculate raw edge for Kelly Criterion
    const raw_edge = effective_price < 1 && effective_price > 0
      ? (winProb - effective_price) / (1 - effective_price)
      : 0;
    
    let house_amount = 0;
    let house_label = 'SLIPPAGE_TRAP';
    
    if (raw_edge > 0) {
      // Kelly Criterion: f* = (bp - q) / b
      // where b = odds (1/effective_price - 1), p = winProb, q = 1 - winProb
      // Simplified: f* = (winProb - effective_price) / (1 - effective_price)
      const kelly_fraction = raw_edge;
      house_amount = HOUSE_BANKROLL * kelly_fraction * KELLY_FRACTION;
      house_label = 'VALUE_BUY';
    }
    
    // ============================================================================
    // STEP 5: SCORE & VERDICT MATRIX (Using Real Edge)
    // ============================================================================
    
    const polyscore = Math.round(winProb * 100);
    const edge = real_edge_pct; // Use real edge (with slippage) for verdict
    
    // Simplified verdict logic - check if effective price > AI value
    let verdict = 'FAIR_MARKET_VALUE';
    let color = '#94A3B8'; // Slate
    let icon = '⚖️'; // Scale
    
    // If estimated fill > AI value, it's negative expected value
    if (effective_price > winProb) {
      verdict = 'NEGATIVE_EXPECTED_VALUE';
      color = '#EF4444'; // Red
      icon = '🚫'; // Stop sign
    } else if (edge > 15 && niche_win_rate > 0.65) {
      verdict = 'INSTITUTIONAL_ALPHA';
      color = '#10B981'; // Emerald
      icon = '🏆'; // Trophy
    } else if (edge > 5) {
      verdict = 'STRATEGIC_VALUE';
      color = '#22C55E'; // Green
      icon = '✅'; // Check
    } else if (edge < -5) {
      verdict = 'NEGATIVE_EDGE';
      color = '#EF4444'; // Red
      icon = '⚠️'; // Alert
    }

    // ============================================================================
    // STEP 6: DYNAMIC NARRATIVE EXPLAINER (The "Take")
    // ============================================================================
    
    let takeaway = '';
    const signals: string[] = [];
    
    // Slippage trap signal
    if (effective_price > winProb) {
      signals.push(`Warning: Estimated fill price (${(effective_price * 100).toFixed(1)}¢) exceeds AI fair value (${(winProb * 100).toFixed(1)}¢). Slippage eliminates expected value.`);
    }
    
    // Expert + Value signal
    if (niche_win_rate > 0.65 && edge > 5) {
      signals.push(`${finalNiche} specialist is buying a significant price discount.`);
    }
    
    // Heavy Bet + Timing signal
    if (Math.abs(z_score) > 3 && minutes_to_start > 0 && minutes_to_start < 30) {
      signals.push(`Outlier conviction (${formatCurrency(tradeTotal)}) detected just ${minutes_to_start} minutes before event start.`);
    }
    
    // Averaging Down signal
    if (is_averaging_down) {
      signals.push(`Trader is aggressively lowering their cost basis on this outcome.`);
    }
    
    // Negative Edge signal
    if (edge < -5 && Math.abs(z_score) > 2) {
      signals.push(`Warning: High-volume trader is currently overpaying for this position.`);
    }
    
    // Default takeaway if no strong signals
    if (signals.length === 0) {
      if (edge > 0) {
        takeaway = `AI projects ${(winProb * 100).toFixed(1)}% win probability. After slippage, effective entry is ${(effective_price * 100).toFixed(1)}¢, representing a ${edge.toFixed(1)}% real edge.`;
      } else if (edge < 0) {
        takeaway = `AI projects ${(winProb * 100).toFixed(1)}% win probability. After slippage, effective entry is ${(effective_price * 100).toFixed(1)}¢, ${Math.abs(edge).toFixed(1)}% below fair value.`;
      } else {
        takeaway = `AI projects ${(winProb * 100).toFixed(1)}% win probability, aligned with effective entry price after slippage.`;
      }
    } else {
      takeaway = signals.join(' ');
    }

    // ============================================================================
    // STEP 7: JSON OUTPUT
    // ============================================================================
    
    const response = {
      success: true,
      polyscore: polyscore,
      valuation: {
        spot_price: parseFloat(spot_price.toFixed(3)),
        estimated_fill: parseFloat(effective_price.toFixed(3)),
        ai_fair_value: parseFloat(winProb.toFixed(3)),
        real_edge_pct: parseFloat(real_edge_pct.toFixed(2)),
      },
      house_instruction: {
        amount: parseFloat(house_amount.toFixed(2)),
        label: house_label,
      },
      analysis: {
        niche_name: finalNiche,
        verdict: verdict,
        color: color,
        icon: icon,
        takeaway: takeaway,
        tactical: {
          sequence: trade_sequence,
          timing: minutes_to_start > 0 ? `${minutes_to_start}m to Start` : 'Event Started',
          exposure: parseFloat(exposure.toFixed(2)),
          tempo: tempo,
        },
        prediction_stats: {
          trade_profile: tradeProfile,
          data_source: profileResult.data_source,
          ai_fair_value: parseFloat(winProb.toFixed(3)),
          model_roi_pct: parseFloat(real_edge_pct.toFixed(2)),
          trader_historical_roi_pct: parseFloat(trader_historical_roi_pct.toFixed(2)),
          trader_win_rate: parseFloat(niche_win_rate.toFixed(3)),
          trade_count: profileResult.trade_count,
          conviction_multiplier: dna_stddev > 0.5 && dna_avg > 0
            ? parseFloat(Math.max(0.1, Math.min(10, (tradeTotal / dna_avg))).toFixed(1))
            : null,
          // PredictionStats component fields (matching L_ prefix naming)
          profile_L_win_rate: niche_win_rate,
          global_L_win_rate: dna_global_win_rate,
          // Calculate avg PnL: if profile has l_avg_pnl_per_trade_usd, use it; otherwise calculate from ROI
          profile_L_avg_pnl_per_trade_usd: (() => {
            // Try to get from matched profile first (if available)
            const matchedProfile = profileStats.find((p: any) => 
              p.final_niche === finalNiche && 
              (p.bet_structure === betStructure || p.structure === betStructure) &&
              (p.price_bracket === priceBracket || p.bracket === priceBracket)
            );
            if (matchedProfile) {
              const avgPnl = matchedProfile.l_avg_pnl_per_trade_usd || matchedProfile.L_avg_pnl_per_trade_usd ||
                            matchedProfile.l_avg_pnl_trade_usd || matchedProfile.L_avg_pnl_trade_usd ||
                            matchedProfile.l_avg_pnl_usd || matchedProfile.L_avg_pnl_usd;
              if (typeof avgPnl === 'number' && !isNaN(avgPnl) && avgPnl !== 0) {
                return parseFloat(avgPnl.toFixed(2));
              }
            }
            // Fallback: calculate from ROI% * avg trade size
            return dna_avg > 0 && trader_historical_roi_pct !== 0
              ? parseFloat((dna_avg * (trader_historical_roi_pct / 100)).toFixed(2))
              : 0;
          })(),
          global_L_avg_pnl_per_trade_usd: dna_avg > 0 && typeof globalStats.global_roi_pct === 'number' && !isNaN(globalStats.global_roi_pct)
            ? parseFloat((dna_avg * (globalStats.global_roi_pct / 100)).toFixed(2))
            : 0,
          profile_L_roi_pct: trader_historical_roi_pct / 100, // trader_historical_roi_pct is already a percentage (e.g., 15.2), convert to decimal
          global_L_roi_pct: (typeof globalStats.global_roi_pct === 'number' && !isNaN(globalStats.global_roi_pct) 
            ? globalStats.global_roi_pct 
            : 0) / 100, // global_roi_pct is already a percentage, convert to decimal
          profile_current_win_streak: 0, // Placeholder - would need to query recent trades
          global_current_win_streak: 0, // Placeholder
          profile_L_count: profileResult.trade_count,
          current_market_exposure: parseFloat(exposure.toFixed(2)),
          current_trade_size: parseFloat(tradeTotal.toFixed(2)),
          global_L_avg_pos_size_usd: dna_avg, // Using avg bet size as proxy for avg position size
          global_L_avg_trade_size_usd: dna_avg,
          // V10 features for transparency
          v10_features: {
            trade_size_tier: trade_size_tier,
            trader_sells_ratio: parseFloat(trader_sells_ratio.toFixed(3)),
            is_hedging: is_hedging === 1,
            is_in_best_niche: is_in_best_niche === 1,
            trader_best_niche: trader_best_niche,
            is_with_crowd: is_with_crowd === 1,
            market_age_bucket: market_age_bucket,
            niche_experience_pct: parseFloat(niche_experience_pct.toFixed(3)),
            trader_selectivity: parseFloat(trader_selectivity.toFixed(3)),
            price_vs_trader_avg: parseFloat(price_vs_trader_avg.toFixed(3)),
          },
        },
      },
    };
    
    console.log('[predict-trade] RESPONSE:', JSON.stringify(response, null, 2));
    
    return new Response(JSON.stringify(response), { 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });

  } catch (error: any) {
    console.error('[predict-trade] Error:', error)
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500, 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    })
  }
})

// Helper function to format currency
function formatCurrency(value: number): string {
  if (!Number.isFinite(value)) return '$0';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}
