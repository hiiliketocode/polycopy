-- Manually upgrade user to premium for testing
-- (In production, this happens automatically via Stripe webhooks)

UPDATE profiles 
SET 
  is_premium = true,
  premium_since = NOW()
WHERE email = 'brad+1@rmkbl.agency';

-- Verify the upgrade
SELECT 
  id, 
  email, 
  is_premium, 
  premium_since,
  stripe_customer_id
FROM profiles 
WHERE email = 'brad+1@rmkbl.agency';

