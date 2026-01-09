-- Add a durable audit trail for order execution attempts.

CREATE TABLE public.order_events_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid NULL,
  wallet_address text NULL,
  order_intent_id uuid NOT NULL,
  request_id text NOT NULL,
  condition_id text NULL,
  token_id text NULL,
  side text NOT NULL,
  outcome text NULL,
  order_type text NOT NULL,
  slippage_bps int NULL,
  limit_price numeric NULL,
  size numeric NULL,
  min_order_size numeric NULL,
  tick_size numeric NULL,
  best_bid numeric NULL,
  best_ask numeric NULL,
  input_mode text NOT NULL,
  usd_input numeric NULL,
  contracts_input numeric NULL,
  auto_correct_applied boolean NOT NULL DEFAULT false,
  status text NOT NULL,
  polymarket_order_id text NULL,
  http_status int NULL,
  error_code text NULL,
  error_message text NULL,
   raw_error jsonb NULL
);

CREATE INDEX order_events_log_user_created_idx ON public.order_events_log (user_id, created_at DESC);
CREATE INDEX order_events_log_wallet_created_idx ON public.order_events_log (wallet_address, created_at DESC);
CREATE INDEX order_events_log_order_intent_idx ON public.order_events_log (order_intent_id);
CREATE INDEX order_events_log_request_idx ON public.order_events_log (request_id);

ALTER TABLE public.order_events_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS order_events_log_select_own ON public.order_events_log;
CREATE POLICY order_events_log_select_own
ON public.order_events_log
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS order_events_log_insert_service_role ON public.order_events_log;
CREATE POLICY order_events_log_insert_service_role
ON public.order_events_log
FOR INSERT
TO service_role
WITH CHECK (true);

DROP POLICY IF EXISTS order_events_log_update_service_role ON public.order_events_log;
CREATE POLICY order_events_log_update_service_role
ON public.order_events_log
FOR UPDATE
TO service_role
WITH CHECK (true);
