// Supabase Edge Function: Get PolyScore
// Flow: 1) Check markets table, 2) Fetch from Dome if missing, 3) Classify, 4) Send to BQ

import { BigQuery } from "npm:@google-cloud/bigquery@^7.0.0";
import { createClient } from "npm:@supabase/supabase-js@^2.0.0";

// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Initialize BigQuery client
function getBigQueryClient() {
  const projectId = Deno.env.get("GOOGLE_CLOUD_PROJECT_ID");
  const credentialsJson = Deno.env.get("GOOGLE_CLOUD_CREDENTIALS_JSON");

  if (!projectId) {
    throw new Error("GOOGLE_CLOUD_PROJECT_ID environment variable is required");
  }

  if (!credentialsJson) {
    throw new Error("GOOGLE_CLOUD_CREDENTIALS_JSON environment variable is required");
  }

  let credentials;
  try {
    credentials = JSON.parse(credentialsJson);
  } catch (error) {
    throw new Error(`Failed to parse GOOGLE_CLOUD_CREDENTIALS_JSON: ${error.message}`);
  }

  return new BigQuery({
    projectId,
    credentials,
  });
}

// Initialize Supabase client
function getSupabaseClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY");

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY) environment variables are required");
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

// Fetch market from Dome API
async function fetchMarketFromDome(conditionId: string): Promise<any | null> {
  const domeApiKey = Deno.env.get("DOME_API_KEY");
  if (!domeApiKey) {
    console.warn("[PolyScore] DOME_API_KEY not set, skipping Dome fetch");
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
    console.error("[PolyScore] Error fetching from Dome API:", error);
    return null;
  }
}

// Map Dome market to Supabase row format
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
    // Skip event_slug to avoid relationship errors
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

interface OriginalTrade {
  wallet_address: string;
  condition_id: string;
  side: "BUY" | "SELL";
  price: number;
  shares_normalized: number;
  timestamp: string;
}

interface MarketContext {
  current_price: number;
  current_timestamp: string;
  market_volume_total?: number | null;
  market_tags?: string | null;
  market_bet_structure?: string | null;
  market_market_subtype?: string | null;
  market_duration_days?: number | null;
  market_title?: string | null;
  market_event_slug?: string | null;
  market_start_time_unix?: number | null;
  market_end_time_unix?: number | null;
  market_volume_1_week?: number | null;
  market_volume_1_month?: number | null;
  market_negative_risk_id?: string | null;
  game_start_time?: string | null;
  token_label?: string | null;
  token_id?: string | null;
}

interface RequestBody {
  original_trade: OriginalTrade;
  market_context: MarketContext;
  user_slippage: number;
}

interface PolyScoreResponse {
  success: boolean;
  prediction: {
    probability: number;
    edge_percent: number;
    score_0_100: number;
  };
  ui_presentation: {
    verdict: "STRONG_BUY" | "BUY" | "HOLD" | "AVOID";
    verdict_color: "green" | "yellow" | "red";
    headline: string;
    badges: Array<{
      label: string;
      icon: string;
    }>;
  };
  analysis: {
    factors: {
      is_smart_money: boolean;
      is_value_bet: boolean;
      is_heavy_bet: boolean;
    };
    debug: {
      z_score: number;
      niche: string;
    };
  };
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Parse request body
    const body: RequestBody = await req.json();

    console.log("[PolyScore] Received request:", JSON.stringify(body, null, 2));

    // Extract values from nested structure
    const wallet_address = body.original_trade?.wallet_address;
    const condition_id = body.original_trade?.condition_id;
    const current_price = body.market_context?.current_price;
    const user_slippage = body.user_slippage;

    // Validate required fields
    if (!wallet_address || !condition_id || current_price === undefined || user_slippage === undefined) {
      return new Response(
        JSON.stringify({
          error: "Missing required fields",
          details: "original_trade.wallet_address, original_trade.condition_id, market_context.current_price, and user_slippage are required",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`[PolyScore] Processing request for wallet: ${wallet_address}, condition: ${condition_id}`);

    // Initialize clients
    const bigquery = getBigQueryClient();
    const supabase = getSupabaseClient();

    // --- STEP 1: FETCH MARKET FROM DOME API (Skip Supabase query to avoid relationship errors) ---
    // PostgREST tries to auto-resolve relationships when querying markets table due to event_slug column
    // Since we don't have an events table, we'll skip the DB check and always fetch from Dome
    // This ensures we always have fresh data and avoids relationship errors
    console.log(`[PolyScore] Fetching market ${condition_id} from Dome API...`);
    let marketRow: any = null;
    
    const domeMarket = await fetchMarketFromDome(condition_id);
    
    if (domeMarket) {
      const marketData = mapDomeMarketToRow(domeMarket);
      
      // Save to Supabase (without event_slug to avoid relationship errors)
      // Note: We're not setting event_slug in mapDomeMarketToRow, so this should be safe
      // If upsert fails due to relationship errors, we'll just use the Dome data
      try {
        const { error: upsertError } = await supabase
          .from("markets")
          .upsert(marketData, { onConflict: "condition_id" });
        
        if (upsertError) {
          const errorMsg = upsertError.message || JSON.stringify(upsertError);
          // Check if it's a relationship error - if so, just log and continue
          if (errorMsg.includes("relationship") || errorMsg.includes("events") || errorMsg.includes("schema cache")) {
            console.warn("[PolyScore] Relationship error during upsert (expected), continuing with Dome data:", errorMsg);
          } else {
            console.warn("[PolyScore] Error saving market to Supabase:", upsertError);
          }
          // Continue anyway - we have the data from Dome
        } else {
          console.log("[PolyScore] Market saved to Supabase");
        }
        // Always use Dome data regardless of upsert success/failure
        marketRow = marketData;
      } catch (error: any) {
        const errorMsg = error?.message || String(error);
        if (errorMsg.includes("relationship") || errorMsg.includes("events") || errorMsg.includes("schema cache")) {
          console.warn("[PolyScore] Relationship error caught during upsert (expected), continuing:", errorMsg);
        } else {
          console.warn("[PolyScore] Exception saving market:", error);
        }
        // Continue anyway - we have the data from Dome
        marketRow = marketData;
      }
    } else {
      console.warn("[PolyScore] Could not fetch market from Dome API, using request body data");
    }

    // --- STEP 2: USE MARKET DATA (from Dome or request body) ---
    const marketData = marketRow || {
      bet_structure: body.market_context?.market_bet_structure || null,
      market_subtype: null,
      tags: body.market_context?.market_tags 
        ? (typeof body.market_context.market_tags === "string" 
            ? JSON.parse(body.market_context.market_tags) 
            : body.market_context.market_tags)
        : [],
      start_time_unix: body.market_context?.market_start_time_unix || null,
      end_time_unix: body.market_context?.market_end_time_unix || null,
      volume_total: body.market_context?.market_volume_total || 1000,
      game_start_time: body.market_context?.game_start_time || null,
      negative_risk_id: null,
      updated_at: new Date().toISOString(),
      title: body.market_context?.market_title || null,
    };

    // --- STEP 4: CLASSIFY MARKET (call predict-trade or do inline) ---
    // For now, we'll use the classification from predict-trade edge function
    // The frontend should call predict-trade separately, but we can also do it here if needed
    // For this version, we'll proceed with the data we have

    // --- STEP 5: FETCH HISTORICAL DNA FROM BIGQUERY ---
    const semantic_tags = (marketData.tags || []).filter((tag: string) => 
      tag && typeof tag === "string" &&
      !["sports", "games", "hide from new", "recurring"].includes(tag.toLowerCase())
    ).join(" ");

    const dnaQuery = `
      SELECT * FROM \`polycopy_v1.trader_dna_snapshots\`
      WHERE wallet_address = @wallet 
        AND market_market_subtype = @subtype
      LIMIT 1
    `;

    let dna: any = {};
    try {
      const [dnaRows] = await bigquery.query({
        query: dnaQuery,
        params: { 
          wallet: wallet_address, 
          subtype: marketData.market_subtype || "Unknown" 
        },
      });
      dna = dnaRows[0] || {};
    } catch (dnaError) {
      console.warn("[PolyScore] Could not fetch trader DNA, using defaults:", dnaError);
    }

    // --- STEP 6: ASSEMBLE FEATURE PAYLOAD AND RUN PREDICTION ---
    const trade_value = body.original_trade.shares_normalized * body.original_trade.price;
    const market_duration_days = marketData.end_time_unix && marketData.start_time_unix
      ? (marketData.end_time_unix - marketData.start_time_unix) / 86400
      : (body.market_context.market_duration_days || 1);
    const currentTimestamp = new Date().getTime() / 1000;

    const modelInput: any = {
      is_profitable_action: 0,
      price: current_price,
      side: body.original_trade.side || "BUY",
      subtype_specific_win_rate: dna.specific_win_rate || dna.profitability_rate || 0.5,
      league_specific_win_rate: dna.specific_win_rate || dna.profitability_rate || 0.5,
      bet_type_specific_win_rate: dna.specific_win_rate || dna.profitability_rate || 0.5,
      win_rate_last_7_days: dna.profitability_rate || 0.5,
      conviction_z_score: dna.avg_trade_value && dna.stddev_trade_value
        ? (trade_value - dna.avg_trade_value) / (dna.stddev_trade_value || 1)
        : 0,
      is_hedged: 0,
      is_field_bet: 0,
      trade_sequence: 1,
      trader_tempo_seconds: 300,
      position_adjustment_style: "Initial Entry",
      market_duration_days: market_duration_days > 0 ? market_duration_days : 1,
      market_volume_total: marketData.volume_total || body.market_context.market_volume_total || 0,
      seconds_before_game_start: marketData.game_start_time 
        ? Math.round((new Date(marketData.game_start_time).getTime() / 1000) - currentTimestamp)
        : 999999,
      seconds_before_market_end: marketData.end_time_unix 
        ? Math.round(marketData.end_time_unix - currentTimestamp)
        : 999999,
      implicit_slippage: 0,
      liquidity_stress_score: marketData.volume_total 
        ? trade_value / (marketData.volume_total || 1)
        : 0,
      semantic_tags: semantic_tags || "",
      bet_type: marketData.bet_structure || body.market_context.market_bet_structure || "Binary",
      subtype: marketData.market_subtype || body.market_context.market_market_subtype || "Unknown"
    };

    // Run BigQuery ML prediction
    const predictionQuery = `
      SELECT * FROM ML.PREDICT(
        MODEL \`polycopy_v1.trade_predictor_v5\`, 
        (SELECT 
          @is_profitable_action as is_profitable_action,
          @price as price,
          @side as side,
          @win_rate_last_7_days as win_rate_last_7_days,
          @bet_type_specific_win_rate as bet_type_specific_win_rate,
          @subtype_specific_win_rate as subtype_specific_win_rate,
          @league_specific_win_rate as league_specific_win_rate,
          @position_adjustment_style as position_adjustment_style,
          @is_hedged as is_hedged,
          @trade_sequence as trade_sequence,
          @trader_tempo_seconds as trader_tempo_seconds,
          @conviction_z_score as conviction_z_score,
          @market_duration_days as market_duration_days,
          ML.NGRAMS(SPLIT(@semantic_tags, ' '), [1, 2]) as market_dna,
          @implicit_slippage as implicit_slippage,
          @liquidity_stress_score as liquidity_stress_score,
          @market_volume_total as market_volume_total
        )
      )
    `;

    let prediction: any;
    try {
      const [predictionRows] = await bigquery.query({ 
        query: predictionQuery, 
        params: modelInput 
      });
      prediction = predictionRows[0];
    } catch (predictionError: any) {
      console.error("[PolyScore] BigQuery prediction error:", predictionError);
      throw new Error(`BigQuery prediction failed: ${predictionError.message}`);
    }

    if (!prediction || !prediction.predicted_is_profitable_action_probs || !prediction.predicted_is_profitable_action_probs[0]) {
      throw new Error("Invalid prediction result from BigQuery");
    }

    const ai_profit_probability = prediction.predicted_is_profitable_action_probs[0].prob;
    const edge_percent = ((ai_profit_probability - current_price) / current_price) * 100;
    const score_0_100 = Math.round(ai_profit_probability * 100);

    // Determine verdict
    let verdict: "STRONG_BUY" | "BUY" | "HOLD" | "AVOID";
    let verdict_color: "green" | "yellow" | "red";
    if (edge_percent > 10 && ai_profit_probability > 0.7) {
      verdict = "STRONG_BUY";
      verdict_color = "green";
    } else if (edge_percent > 5 && ai_profit_probability > 0.6) {
      verdict = "BUY";
      verdict_color = "green";
    } else if (edge_percent > 0) {
      verdict = "HOLD";
      verdict_color = "yellow";
    } else {
      verdict = "AVOID";
      verdict_color = "red";
    }

    const finalResponse: PolyScoreResponse = {
      success: true,
      prediction: {
        probability: ai_profit_probability,
        edge_percent: Math.round(edge_percent * 10) / 10,
        score_0_100,
      },
      ui_presentation: {
        verdict,
        verdict_color,
        headline: `${edge_percent > 0 ? `${Math.round(edge_percent)}% Edge Detected` : "Low Edge Opportunity"}`,
        badges: [
          ...(edge_percent > 10 ? [{ label: "High Conviction", icon: "🔥" }] : []),
          ...(dna.specific_win_rate > 0.6 ? [{ label: "Niche Expert", icon: "🧠" }] : []),
        ],
      },
      analysis: {
        factors: {
          is_smart_money: (dna.specific_win_rate || 0) > 0.6,
          is_value_bet: ai_profit_probability > current_price,
          is_heavy_bet: Math.abs(modelInput.conviction_z_score) > 2,
        },
        debug: {
          z_score: modelInput.conviction_z_score,
          niche: marketData.market_subtype || "Unknown",
        },
      },
    };

    console.log(`[PolyScore] Success! Score: ${score_0_100}, Edge: ${edge_percent}%`);
    return new Response(JSON.stringify(finalResponse), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("[PolyScore] CRITICAL ERROR:", error);
    console.error("[PolyScore] Error stack:", error.stack);
    return new Response(
      JSON.stringify({ 
        error: "Internal Server Error", 
        details: error.message || "An unexpected error occurred" 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
