-- Clear Stripe customer ID for your test account
-- This allows Stripe to create a new TEST mode customer

UPDATE profiles 
SET stripe_customer_id = NULL 
WHERE email = 'brad+1@rmkbl.agency';

-- Verify it was cleared
SELECT id, email, stripe_customer_id, is_premium 
FROM profiles 
WHERE email = 'brad+1@rmkbl.agency';

