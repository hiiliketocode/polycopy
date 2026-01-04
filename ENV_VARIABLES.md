# Environment Variables Reference
# Copy values to your .env.local file

## Supabase
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

## Stripe
```
STRIPE_SECRET_KEY=sk_test_... # Use sk_live_... for production
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_... # Use pk_live_... for production
STRIPE_PRICE_ID=price_... # Your subscription price ID
STRIPE_WEBHOOK_SECRET=whsec_... # Your webhook endpoint secret
```

## Resend (Email)
```
RESEND_API_KEY=re_... # Your Resend API key
```

## Twilio (SMS & WhatsApp) - NEW ✨
```
TWILIO_ACCOUNT_SID=AC... # Your Twilio Account SID
TWILIO_AUTH_TOKEN=your_auth_token # Your Twilio Auth Token
TWILIO_PHONE_NUMBER=+15551234567 # Your Twilio SMS phone number
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886 # Twilio WhatsApp number (sandbox or approved)
```

## Cron
```
CRON_SECRET=your_random_cron_secret # Used to secure cron endpoints
```

## App URL
```
NEXT_PUBLIC_APP_URL=http://localhost:3000 # Production: https://polycopy.app
```

---

## Setup Instructions

1. Copy all values to your `.env.local` file
2. Get Twilio credentials from [https://www.twilio.com/console](https://www.twilio.com/console)
3. Restart your development server after adding new variables

For detailed Twilio setup, see [SMS_WHATSAPP_SETUP.md](./SMS_WHATSAPP_SETUP.md)

