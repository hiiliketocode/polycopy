// Supabase Edge Function: Get PolyScore
// This function queries Google BigQuery ML model to calculate PolyScore for a trade

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
  poly_score: number;
  alpha_score: number;
  conviction_score: number;
  value_score: number;
  ai_profit_probability: number;
  subtype_specific_win_rate: number;
  bet_type_specific_win_rate: number;
  position_adjustment_style: string;
  trade_sequence: number;
  is_hedged: number;
  current_price?: number;
  user_slippage?: number;
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

    // --- STEP A: FETCH LIVE DATA FROM SUPABASE ---
    const { data: marketRows, error: marketError } = await supabase
      .from('markets')
      .select('bet_structure, market_subtype, tags, start_time_unix, end_time_unix, volume_total, game_start_time, negative_risk_id, updated_at')
      .eq('condition_id', condition_id)
      .order('updated_at', { ascending: false })
      .limit(1);

    if (marketError) {
      console.error("[PolyScore] Supabase market fetch error:", marketError);
      throw new Error(`Supabase market fetch error: ${marketError.message}`);
    }

    if (!marketRows || marketRows.length === 0) {
      console.error(`[PolyScore] Market not found for condition_id: ${condition_id}`);
      return new Response(
        JSON.stringify({
          error: "Market not found",
          details: `Market with condition_id ${condition_id} not found.`,
        }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const marketData = marketRows[0];

    // Fetch recent trader actions for this condition
    const { data: recentActions, error: actionsError } = await supabase
      .from('trades')
      .select('side, price, shares_normalized, timestamp')
      .eq('wallet_address', wallet_address)
      .eq('condition_id', condition_id)
      .order('timestamp', { ascending: true });

    if (actionsError) {
      console.error("[PolyScore] Supabase actions fetch error:", actionsError);
      // Don't fail if we can't get actions, just use empty array
    }

    // --- STEP B: FETCH HISTORICAL DNA FROM BIGQUERY ---
    const semantic_tags = (marketData.tags || []).filter((tag: string) => 
      !['sports', 'games', 'hide from new', 'recurring'].includes(tag)
    ).join(' ');

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
          subtype: marketData.market_subtype || 'Unknown' 
        },
      });
      dna = dnaRows[0] || {};
    } catch (dnaError) {
      console.warn("[PolyScore] Could not fetch trader DNA, using defaults:", dnaError);
    }

    // --- STEP C: ASSEMBLE THE FULL FEATURE PAYLOAD ---
    const lastAction = recentActions?.[recentActions.length - 1];
    const trade_value = (lastAction?.shares_normalized || body.original_trade.shares_normalized || 100) * 
                       (lastAction?.price || body.original_trade.price || current_price);
    const market_duration_days = marketData.end_time_unix && marketData.start_time_unix
      ? (marketData.end_time_unix - marketData.start_time_unix) / 86400
      : (body.market_context.market_duration_days || 1);
    const currentTimestamp = new Date().getTime() / 1000;

    const modelInput: any = {
      is_profitable_action: 0,
      price: current_price,
      side: body.original_trade.side || 'BUY',
      subtype_specific_win_rate: dna.specific_win_rate || dna.profitability_rate || 0.5,
      league_specific_win_rate: dna.specific_win_rate || dna.profitability_rate || 0.5,
      bet_type_specific_win_rate: dna.specific_win_rate || dna.profitability_rate || 0.5,
      win_rate_last_7_days: dna.profitability_rate || 0.5,
      conviction_z_score: dna.avg_trade_value && dna.stddev_trade_value
        ? (trade_value - dna.avg_trade_value) / (dna.stddev_trade_value || 1)
        : 0,
      is_hedged: 0,
      is_field_bet: 0,
      trade_sequence: (recentActions?.length || 0) + 1,
      trader_tempo_seconds: 300,
      position_adjustment_style: lastAction 
        ? (current_price > lastAction.price ? 'Averaging Up' : 'Averaging Down') 
        : 'Initial Entry',
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
      semantic_tags: semantic_tags || '',
      bet_type: marketData.bet_structure || body.market_context.market_bet_structure || 'Binary',
      subtype: marketData.market_subtype || body.market_context.market_market_subtype || 'Unknown'
    };

    // --- STEP D: RUN THE PREDICTION QUERY ---
    // Use direct parameter substitution - BigQuery will infer types from JavaScript values
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

    // --- STEP E: CALCULATE POLYSCORE AND RETURN ---
    const poly_score = Math.round(
      (modelInput.subtype_specific_win_rate * 100 * 0.5) + 
      (ai_profit_probability * 100 * 0.5)
    );
    const alpha_score = Math.round(modelInput.subtype_specific_win_rate * 100);
    const conviction_score = Math.round(
      Math.min(100, Math.max(0, 
        (modelInput.trade_sequence > 1 ? 25 : 0) + 
        (modelInput.trader_tempo_seconds < 120 ? 15 : 0) + 
        (modelInput.conviction_z_score * 20)
      ))
    );
    const value_score = Math.round(
      Math.max(0, (ai_profit_probability - (modelInput.price * (1 + user_slippage))) * 250)
    );

    const finalResponse: PolyScoreResponse = {
      poly_score,
      alpha_score,
      conviction_score,
      value_score,
      ai_profit_probability,
      subtype_specific_win_rate: modelInput.subtype_specific_win_rate,
      bet_type_specific_win_rate: modelInput.bet_type_specific_win_rate,
      position_adjustment_style: modelInput.position_adjustment_style,
      trade_sequence: modelInput.trade_sequence,
      is_hedged: modelInput.is_hedged,
      current_price,
      user_slippage,
    };

    console.log(`[PolyScore] Success! Score: ${finalResponse.poly_score}`);
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
