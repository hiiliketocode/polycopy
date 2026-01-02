-- Check if the user is premium
SELECT 
  id, 
  email, 
  is_premium, 
  premium_since,
  stripe_customer_id
FROM profiles 
WHERE email = 'brad+1@rmkbl.agency';

