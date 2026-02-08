-- ============================================================================
-- Fix: Ensure all "model" strategies have use_model=TRUE
-- ============================================================================
-- Model Balanced, Model Only, Sharp Shooter, Underdog Hunter (and others) were
-- designed to gate on ML score but may have use_model=false in some DB states.
-- This migration corrects any misconfiguration.
-- ============================================================================

UPDATE public.ft_wallets
SET use_model = TRUE
WHERE wallet_id IN (
  'FT_MODEL_BALANCED',   -- "Model Balanced" - model + trader combo
  'FT_MODEL_ONLY',       -- "Model Only" - pure ML signal
  'FT_SHARP_SHOOTER',    -- "Sharp Shooter" - Model 55%+ in design
  'FT_UNDERDOG_HUNTER',  -- "Underdog Hunter" - Model 50%+ in design
  'FT_T1_PURE_ML',       -- T1 Pure ML
  'FT_T3_POLITICS',      -- Politics + ML
  'FT_T4_ML_EDGE',       -- ML + Edge
  'FT_T4_FULL_STACK',    -- Full stack includes ML
  -- Model-mix strategies (from 20260210)
  'FT_ML_SHARP_SHOOTER', 'FT_ML_UNDERDOG', 'FT_ML_FAVORITES', 'FT_ML_HIGH_CONV',
  'FT_ML_EDGE', 'FT_ML_MIDRANGE', 'FT_ML_STRICT', 'FT_ML_LOOSE',
  'FT_ML_CONTRARIAN', 'FT_ML_HEAVY_FAV'
)
AND (use_model IS FALSE OR use_model IS NULL);
