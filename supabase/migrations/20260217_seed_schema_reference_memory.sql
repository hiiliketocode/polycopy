-- Seed the Alpha Agent's permanent schema reference into long-term memory.
-- This memory is always injected into the chat prompt (see schema-reference.ts).
-- Storing it here ensures it's part of the agent's knowledge base and can be
-- retrieved by memory search when relevant (e.g. "what columns does ft_wallets have?").

-- Avoid duplicate if migration runs multiple times
INSERT INTO public.alpha_agent_memory (
  memory_tier,
  memory_type,
  title,
  content,
  confidence,
  tags,
  validated
)
SELECT
  'long_term',
  'strategy_rule',
  '[REFERENCE] Schema & Data — Permanent Knowledge',
  E'This is your permanent schema reference. Always consult it when querying.\n\n**ft_wallets**: Use total_pnl (NOT pnl). For top by PnL: order_by "total_pnl", ascending false.\n**ft_orders**: Has pnl per trade.\n**Dome/Gamma**: search_markets (keyword) and get_market_price (condition_id).\n\nFull reference is injected into your context every chat.',
  1.0,
  ARRAY['schema', 'reference', 'protocol', 'permanent', 'ft_wallets', 'total_pnl', 'dome', 'gamma'],
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.alpha_agent_memory
  WHERE title = '[REFERENCE] Schema & Data — Permanent Knowledge'
);
