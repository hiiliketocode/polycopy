-- Count paying customers (users with active premium subscriptions)
-- A paying customer is someone who:
-- 1. Has is_premium = true
-- 2. Has a stripe_customer_id (has submitted payment details)
-- 3. Has a premium_since date (has been charged at least once)

-- Active paying customers
SELECT 
  COUNT(*) as total_paying_customers,
  COUNT(CASE WHEN premium_since >= NOW() - INTERVAL '30 days' THEN 1 END) as new_last_30_days,
  COUNT(CASE WHEN premium_since >= NOW() - INTERVAL '7 days' THEN 1 END) as new_last_7_days
FROM profiles
WHERE is_premium = true 
  AND stripe_customer_id IS NOT NULL
  AND premium_since IS NOT NULL;

-- Breakdown by signup date
SELECT 
  DATE_TRUNC('month', premium_since) as signup_month,
  COUNT(*) as customers
FROM profiles
WHERE is_premium = true 
  AND stripe_customer_id IS NOT NULL
  AND premium_since IS NOT NULL
GROUP BY DATE_TRUNC('month', premium_since)
ORDER BY signup_month DESC;

-- All premium user details (for verification)
SELECT 
  id,
  user_name,
  email,
  is_premium,
  premium_since,
  CASE WHEN stripe_customer_id IS NOT NULL THEN 'Yes' ELSE 'No' END as has_payment_method,
  created_at
FROM profiles
WHERE is_premium = true
ORDER BY premium_since DESC;
