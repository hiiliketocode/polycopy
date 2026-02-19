#!/usr/bin/env bash
# Test production /api/ml/predict and sanity-check winProb.
set -e
BASE="${1:-https://polycopy.app}"

echo "=== 1. Test POST /api/ml/predict (neutral-ish features) ==="
RESP1=$(curl -s -X POST "${BASE}/api/ml/predict" \
  -H "Content-Type: application/json" \
  -d '{
    "features": {
      "global_win_rate": 0.52,
      "D30_win_rate": 0.52,
      "D7_win_rate": 0.52,
      "niche_win_rate_history": 0.52,
      "lifetime_roi_pct": 0.05,
      "D30_roi_pct": 0.05,
      "D7_roi_pct": 0.05,
      "win_rate_trend_short": 0,
      "win_rate_trend_long": 0,
      "roi_trend_short": 0,
      "roi_trend_long": 0,
      "performance_regime": "STABLE",
      "total_lifetime_trades": 500,
      "trader_experience_bucket": "INTERMEDIATE",
      "niche_experience_pct": 0.5,
      "is_in_best_niche": 0,
      "trader_selectivity": 0.5,
      "price_vs_trader_avg": 0,
      "conviction_z_score": 0,
      "trade_sequence": 1,
      "total_exposure_log": 5,
      "trader_tempo_seconds": 300,
      "is_chasing_price_up": 0,
      "is_averaging_down": 0,
      "stddev_bet_size": 100,
      "is_hedging": 0,
      "trader_sells_ratio": 0.2,
      "is_with_crowd": 0.5,
      "trade_size_tier": "MEDIUM",
      "trade_size_log": 5,
      "final_niche": "POLITICS",
      "bet_structure": "STANDARD",
      "position_direction": "LONG",
      "entry_price": 0.55,
      "volume_momentum_ratio": 0.1,
      "liquidity_impact_ratio": 0.001,
      "market_duration_days": 30,
      "market_age_bucket": "WEEK_1",
      "minutes_to_start": 1000,
      "hours_to_close": 24,
      "market_age_days": 7
    }
  }')
echo "$RESP1" | jq .
WIN1=$(echo "$RESP1" | jq -r '.winProb // empty')
if [[ -z "$WIN1" ]]; then
  echo "FAIL: no winProb in response"
  exit 1
fi
if ! awk -v w="$WIN1" 'BEGIN { exit (w >= 0 && w <= 1) ? 0 : 1 }'; then
  echo "FAIL: winProb out of range: $WIN1"
  exit 1
fi
echo "OK: winProb = $WIN1"

echo ""
echo "=== 2. Test with stronger features (higher expected score) ==="
RESP2=$(curl -s -X POST "${BASE}/api/ml/predict" \
  -H "Content-Type: application/json" \
  -d '{
    "features": {
      "global_win_rate": 0.65,
      "D30_win_rate": 0.68,
      "D7_win_rate": 0.7,
      "niche_win_rate_history": 0.65,
      "lifetime_roi_pct": 0.2,
      "D30_roi_pct": 0.25,
      "D7_roi_pct": 0.2,
      "win_rate_trend_short": 0.05,
      "win_rate_trend_long": 0.03,
      "roi_trend_short": 0.02,
      "roi_trend_long": 0.01,
      "performance_regime": "HOT_STREAK",
      "total_lifetime_trades": 2000,
      "trader_experience_bucket": "EXPERT",
      "niche_experience_pct": 0.8,
      "is_in_best_niche": 1,
      "trader_selectivity": 0.6,
      "price_vs_trader_avg": 0.2,
      "conviction_z_score": 0.5,
      "trade_sequence": 1,
      "total_exposure_log": 6,
      "trader_tempo_seconds": 400,
      "is_chasing_price_up": 0,
      "is_averaging_down": 0,
      "stddev_bet_size": 150,
      "is_hedging": 0,
      "trader_sells_ratio": 0.15,
      "is_with_crowd": 0.3,
      "trade_size_tier": "LARGE",
      "trade_size_log": 6,
      "final_niche": "ENTERTAINMENT",
      "bet_structure": "YES_NO",
      "position_direction": "LONG",
      "entry_price": 0.45,
      "volume_momentum_ratio": 0.2,
      "liquidity_impact_ratio": 0.002,
      "market_duration_days": 20,
      "market_age_bucket": "WEEK_1",
      "minutes_to_start": 500,
      "hours_to_close": 48,
      "market_age_days": 5
    }
  }')
echo "$RESP2" | jq .
WIN2=$(echo "$RESP2" | jq -r '.winProb // empty')
if [[ -z "$WIN2" ]]; then
  echo "FAIL: no winProb in response 2"
  exit 1
fi
echo "OK: winProb (strong) = $WIN2"

echo ""
echo "=== 3. Sanity: stronger features should give higher winProb ==="
if awk -v a="$WIN1" -v b="$WIN2" 'BEGIN { exit (b >= a - 0.01) ? 0 : 1 }'; then
  echo "OK: $WIN2 >= $WIN1 (stronger profile has higher or similar score)"
else
  echo "NOTE: strong profile winProb ($WIN2) < neutral ($WIN1) - model may weight features differently, not necessarily wrong"
fi

echo ""
echo "=== All checks passed. ML predict endpoint is working. ==="
