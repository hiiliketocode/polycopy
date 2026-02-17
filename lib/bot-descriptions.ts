/**
 * Marketing-quality bot descriptions for the v2 bots experience.
 * These provide user-friendly explanations of each strategy without
 * revealing the underlying thresholds, model details, or exact criteria.
 *
 * Used as a fallback/override in the v2 bot detail page when the
 * database description is a terse one-liner.
 */

export const BOT_DESCRIPTIONS: Record<string, string> = {
  // ─── ML Mix (Core Strategies) ───
  FT_ML_SHARP_SHOOTER:
    "Targets only the highest-confidence trades identified by our ML model. This bot prioritizes precision over volume, entering positions only when multiple signals align with strong conviction. Best suited for traders who prefer fewer, higher-quality trades with aggressive Kelly-based sizing.",

  FT_ML_UNDERDOG:
    "Specializes in undervalued positions where the market price significantly underestimates the true probability. This contrarian strategy seeks outsized returns by identifying mispriced opportunities in the lower price range, using disciplined edge-based filtering to avoid traps.",

  FT_ML_FAVORITES:
    "Focuses on high-probability outcomes where the market already leans in one direction but our model identifies additional upside. This lower-risk approach targets consistent, incremental gains from positions with strong underlying conviction.",

  FT_ML_HIGH_CONV:
    "Selects trades where our ML model expresses the strongest agreement with top trader behavior. By requiring elevated conviction signals before entering, this bot filters out noise and focuses on the trades where smart money and machine intelligence converge.",

  FT_ML_EDGE:
    "Combines ML probability estimates with a strict edge requirement, only entering when the model-predicted outcome meaningfully exceeds the current market price. This strategy is designed for traders who want a quantitative, edge-driven approach to position selection.",

  FT_ML_MIDRANGE:
    "Operates in the middle of the probability spectrum, avoiding both heavy favorites and deep underdogs. This balanced strategy targets markets where outcome uncertainty is highest and mispricings are most common, using ML guidance to tilt the odds in your favor.",

  FT_ML_STRICT:
    "Applies the most rigorous ML confidence threshold in our lineup. Trades are only placed when the model is highly confident in the outcome, resulting in fewer positions but with a higher expected hit rate. Ideal for conservative allocation strategies.",

  FT_ML_LOOSE:
    "Casts a wider net by accepting a broader range of ML-scored trades. This higher-volume strategy captures more opportunities across markets, relying on the law of large numbers and positive expected value to generate returns over time.",

  FT_ML_CONTRARIAN:
    "Takes positions that go against the crowd. When the market favors one outcome, this bot looks for ML-backed signals suggesting the opposite may be underpriced. Higher risk, but designed to capture outsized returns when the consensus is wrong.",

  FT_ML_HEAVY_FAV:
    "Targets positions deep in the high-probability range where outcomes are most likely to resolve favorably. This capital-efficient strategy aims for steady, compounding returns from positions with the highest win probability, sized conservatively to manage risk.",

  // ─── ML Sweep (Threshold Variants) ───
  FT_ML_SWEEP_50:
    "A broad ML-powered strategy that captures all trades where our model estimates at least a 50% probability. Higher trade volume with a diversified approach across many markets and outcomes.",

  FT_ML_SWEEP_55:
    "Filters for trades where our model indicates a moderate confidence level. Balances trade volume with signal quality, offering exposure to a wide range of market opportunities.",

  FT_ML_SWEEP_60:
    "Requires a solid ML confidence level before entering positions. This middle-ground threshold balances selectivity with opportunity, focusing on trades where the model shows meaningful conviction.",

  FT_ML_SWEEP_65:
    "Applies a higher-than-average ML confidence requirement. Fewer trades, but each one carries stronger model backing. Designed for traders who prefer quality signals over volume.",

  FT_ML_SWEEP_70:
    "The most selective threshold sweep variant, only entering when our ML model is highly confident. Expects the fewest trades but the highest per-trade accuracy in this family of strategies.",

  // ─── ML Context (Category & Filter Variants) ───
  FT_ML_CTX_SWEET_SPOT:
    "Targets the probability sweet spot -- markets in a mid-range price band where prediction edges tend to be largest. By avoiding both near-certainties and long-shots, this strategy focuses on the zone with the richest alpha potential.",

  FT_ML_CTX_NO_CRYPTO:
    "Applies our ML model across all markets except cryptocurrency. This filtered approach avoids the higher volatility and noise typical of crypto markets, focusing on politics, sports, and other categories where patterns may be more predictable.",

  FT_ML_CTX_LIVE:
    "Focuses exclusively on live, in-progress events where real-time information creates pricing inefficiencies. This fast-moving strategy capitalizes on odds shifts during active games, debates, and breaking news situations.",

  FT_ML_CTX_SPORTS:
    "A sports-only strategy that applies ML scoring to athletic events across multiple leagues. Leverages pattern recognition in player performance, team dynamics, and situational factors that traditional oddsmakers may underweight.",

  FT_ML_CTX_POLITICS:
    "Dedicated to political markets, this strategy uses ML analysis to identify mispricings in elections, policy decisions, and geopolitical events. Political markets often feature persistent biases that systematic approaches can exploit.",

  FT_ML_CTX_ML_SCALED:
    "Uses an advanced ML-scaled allocation method that dynamically adjusts position sizes based on model confidence. Higher-confidence signals receive larger allocations, while lower-confidence trades are sized down proportionally.",

  FT_ML_CTX_65_NO_CRYPTO:
    "Combines a stringent ML confidence threshold with crypto exclusion. This highly selective, non-crypto strategy targets the best opportunities across traditional prediction markets with strong model backing.",

  FT_ML_CTX_NO_CRYPTO_3X:
    "Filters out cryptocurrency markets and requires elevated trader conviction. This approach targets high-conviction, non-crypto opportunities where experienced traders and our ML model agree on the outcome.",

  FT_ML_CTX_FAVORITES:
    "Focuses on market favorites in a mid-to-high probability range. This strategy targets outcomes that are likely but not yet fully priced in, seeking to capture the remaining upside with disciplined, ML-guided entries.",

  FT_ML_CTX_AB_FIXED:
    "A/B test variant using fixed-size bets across ML-filtered trades. This systematic approach allocates the same capital to each trade, allowing the strategy's edge to compound predictably without bet-sizing variance.",

  FT_ML_CTX_AB_KELLY:
    "A/B test variant using Kelly criterion sizing across ML-filtered trades. Dynamically sizes each position based on the estimated edge, aiming to maximize long-run growth rate while managing downside risk.",

  // ─── Tier 1-4 Core Strategies ───
  FT_HIGH_CONVICTION:
    "Follows the highest-conviction signals from top Polymarket traders, filtered through our model for additional validation. Only enters when both human expertise and machine analysis agree on the opportunity.",

  FT_MODEL_BALANCED:
    "A balanced approach that weighs ML model output, trader track record, and market conditions equally. Designed as a benchmark strategy that provides broad, diversified exposure to the best signals across all categories.",

  FT_UNDERDOG_HUNTER:
    "Seeks outsized returns by targeting underdog positions where our analysis suggests the market has overestimated the probability of the favorite. Higher variance, but with significant upside potential on each winning trade.",

  FT_FAVORITE_GRINDER:
    "A grinding strategy that accumulates small, consistent wins by backing market favorites. Lower risk per trade with steady compounding -- the tortoise approach to prediction market profits.",

  FT_SHARP_SHOOTER:
    "Precision-focused strategy that waits patiently for the best setups. Low trade frequency, high conviction. Every position is backed by strong statistical evidence and model agreement.",

  FT_MODEL_ONLY:
    "Pure ML model-driven execution with no additional human filters. This strategy trusts the model completely, providing a clean signal of how our AI performs in live market conditions.",

  // ─── T2 (Strategy Variants) ───
  FT_T2_CONTRARIAN:
    "A systematic contrarian approach that identifies where the crowd may be wrong. Uses trader behavior patterns and model disagreements to find value in unpopular positions.",

  FT_T2_MIDRANGE:
    "Targets the uncertain middle ground where markets are most efficiently priced -- and where small edges can compound into meaningful returns over hundreds of trades.",

  FT_T2_FAVORITES:
    "Backs likely outcomes with a probability edge. This conservative strategy targets high-probability positions where our model confirms the market consensus but identifies remaining upside.",

  FT_T2_LONGSHOTS:
    "Systematically bets on low-probability outcomes where the expected value is positive. Accepts long losing streaks in exchange for occasional large payoffs that more than compensate.",

  FT_T2_HEAVY_FAV:
    "Concentrates on deep favorites in the highest probability tier. Maximum win rate, minimum variance per trade. Ideal as a capital preservation strategy with modest but reliable returns.",

  // ─── T3 (Category-Specific) ───
  FT_T3_SPORTS:
    "Dedicated sports market strategy covering major leagues and events. Leverages statistical patterns in athletic competition that prediction markets often misprice.",

  FT_T3_CRYPTO:
    "Focused exclusively on cryptocurrency markets. Navigates the high-volatility crypto prediction landscape using ML-guided entries and strict risk controls.",

  FT_T3_POLITICS:
    "Political market specialist. Exploits the well-documented biases in political prediction markets using systematic, model-driven position selection.",

  FT_T3_FINANCE:
    "Targets financial and economic markets. Applies quantitative analysis to interest rate decisions, GDP forecasts, and other macro-economic prediction markets.",

  // ─── T4 (Multi-Factor Combinations) ───
  FT_T4_WR_CONV:
    "Combines win rate analysis with conviction scoring. Only enters when a trader's historical accuracy and their current trade conviction both exceed threshold levels.",

  FT_T4_ML_EDGE:
    "Dual-filter strategy requiring both ML model approval and a quantitative edge. The strictest version of our edge-based approach, demanding alignment across multiple signal types.",

  FT_T4_CONTR_CONV:
    "Contrarian positions backed by high conviction. Takes the other side of popular bets, but only when our analysis shows strong quantitative support for the contrarian view.",

  FT_T4_FAV_WR:
    "Favorites filtered by trader win rate. Combines the safety of backing likely outcomes with the quality filter of only following traders with proven track records.",

  FT_T4_TRIPLE:
    "Triple-screened strategy requiring ML model approval, trader conviction, and positive edge. The most selective multi-factor approach in our lineup.",

  FT_T4_FULL_STACK:
    "The everything strategy. Applies all available filters simultaneously -- ML model, edge, conviction, win rate, and experience. Ultra-selective with maximum signal quality per trade.",

  // ─── Special Strategies ───
  FT_S_WHALE:
    "Follows the largest traders on Polymarket -- the whales whose positions move markets. This strategy mirrors the bets of traders with the deepest pockets and most market conviction.",

  FT_S_MICRO:
    "A micro-bet approach using the smallest position sizes for maximum diversification. Spreads capital across many small positions, reducing the impact of any single trade outcome.",

  FT_S_KELLY_AGG:
    "Uses an aggressive Kelly criterion sizing formula to maximize capital growth rate. Higher risk than standard approaches, but mathematically optimized for long-run wealth accumulation.",

  FT_S_EDGE_SCALE:
    "Dynamically scales position sizes based on the estimated edge for each trade. Larger edges get larger allocations, creating a natural risk-reward alignment across the portfolio.",

  // ─── Live Strategies ───
  FT_LIVE_MODEL_ONLY:
    "Live-executing variant of our pure ML model strategy. Real-time deployment of AI-driven trade selection with automated order execution on Polymarket.",

  FT_LIVE_UNDERDOGS:
    "Live underdog hunting with real capital. Automatically enters undervalued positions as they're identified, with full risk management and execution quality monitoring.",

  FT_LIVE_FAVORITES:
    "Automated favorite grinding in live markets. Consistent, small-edge trades executed in real-time with slippage controls and daily budget management.",

  FT_LIVE_HIGH_CONV:
    "High-conviction live execution. Only trades when signals are strongest, with automated position management and risk controls protecting your capital.",

  FT_LIVE_SHARP_SHOOTER:
    "Precision live trading with the lowest signal-to-noise ratio. Patient execution that waits for optimal conditions before deploying capital.",

  FT_LIVE_MIDRANGE:
    "Mid-range live trading across the probability spectrum. Balanced approach to automated execution with broad market coverage.",

  FT_LIVE_WR_ONLY:
    "Live strategy filtered purely by trader win rate. Follows only the most accurate traders in real-time, regardless of other factors.",

  FT_LIVE_EDGE_HUNTER:
    "Automated edge detection and execution. Continuously scans for pricing inefficiencies and deploys capital when quantitative edges appear.",

  FT_LIVE_CONTRARIAN:
    "Live contrarian execution. Automatically takes the other side of popular bets when our model identifies a mispricing, with strict risk limits.",

  FT_LIVE_HEAVY_FAV:
    "Deep favorites executed live. The most conservative automated strategy, targeting the highest-probability outcomes with minimal variance.",

  // ─── PnL Rotation ───
  FT_TOP_DAILY_WINNERS:
    "Dynamic strategy that follows the current top-performing traders based on daily P&L. Automatically rotates to mirror whoever is winning right now.",

  FT_TOP_7D_WINNERS:
    "Follows traders on a hot streak over the past week. This momentum-based strategy rides the wave of recent winners, refreshing its source traders regularly.",
}

/**
 * Returns the v2 marketing description for a bot, falling back to the
 * database description if no override exists.
 */
export function getBotDescription(walletId: string, dbDescription?: string | null): string {
  return BOT_DESCRIPTIONS[walletId] || dbDescription || "AI-powered copy trading strategy."
}
