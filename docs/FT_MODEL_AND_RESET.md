# FT Model Version & Reset Guide

## ML Model

**Current model:** `polycopy_v1.poly_predictor_v11`

- **Location:** BigQuery `gen-lang-client-0299056258.polycopy_v1.poly_predictor_v11`
- **Used by:** `predict-trade` edge function (called from sync, enrich-ml, trade-card)
- **To update:** Change `BQ_MODEL_NAME` in `supabase/functions/predict-trade/index.ts` and redeploy the edge function

When you train a new model (e.g. v12):
1. Create the model in BigQuery (`create-poly-predictor-v12.sql` or similar)
2. Update `BQ_MODEL_NAME` in predict-trade
3. Deploy: `supabase functions deploy predict-trade`
4. Run reset for use_model wallets (see below) to avoid mixed results

## Wallets That Should Use the Model (use_model=true)

These strategies gate on ML score. Migration `20260211_fix_use_model_for_model_strategies.sql` ensures they have `use_model=TRUE`.

| Wallet ID | Model Threshold | Description |
|-----------|-----------------|-------------|
| FT_MODEL_BALANCED | 0.50–0.55 | Model + trader WR + edge |
| FT_MODEL_ONLY | 0.55 | Pure ML signal only |
| FT_SHARP_SHOOTER | 0.55 | Model + conviction + elite params |
| FT_UNDERDOG_HUNTER | 0.50–0.55 | Model + underdogs 0–50¢ |
| FT_T1_PURE_ML | 0.60 | 60%+ ML only |
| FT_T3_POLITICS | 0.55 | Politics + ML |
| FT_T4_ML_EDGE | 0.55 | ML + Edge 10%+ |
| FT_T4_FULL_STACK | 0.55 | All filters + ML |
| FT_ML_* (10 mix strategies) | 0.50–0.65 | Model in different combinations |

**Note:** If Model Balanced, Underdog Hunter, or Sharp Shooter show "No" for Model, run the fix migration or `supabase db push`.

## Reset Wallets (Clean Slate)

After deploying the ML-first fix or changing the model, reset affected wallets so new trades reflect the correct logic:

```bash
# Reset only use_model wallets (recommended after ML-first fix)
curl -X POST https://your-app.vercel.app/api/ft/reset-wallets \
  -H "Content-Type: application/json" \
  -d '{"use_model_only": true, "reset_start_date": true}'

# Reset all wallets
curl -X POST https://your-app.vercel.app/api/ft/reset-wallets \
  -H "Content-Type: application/json" \
  -d '{"use_model_only": false, "reset_start_date": true}'

# Reset specific wallets
curl -X POST https://your-app.vercel.app/api/ft/reset-wallets \
  -H "Content-Type: application/json" \
  -d '{"wallet_ids": ["FT_T1_PURE_ML", "FT_T4_FULL_STACK"], "reset_start_date": true}'
```

**What reset does:**
- Deletes all `ft_orders` for the target wallets
- Deletes all `ft_seen_trades` (so sync will re-evaluate trades)
- Sets `current_balance = starting_balance`
- Optionally sets `start_date = today` for a fresh test period

Sync runs every 5 minutes (cron) and will repopulate from scratch.
