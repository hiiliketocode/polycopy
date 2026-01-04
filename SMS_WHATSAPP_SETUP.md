# SMS & WhatsApp Notifications Setup Guide

## 📱 Feature Overview

Premium users can receive position closure and market resolution notifications via:
- **SMS** (Text Messages)
- **WhatsApp** Messages
- **Email** (Standard for all users)

---

## 🔧 Setup Instructions

### 1. **Database Setup**

Run the SQL script in Supabase SQL Editor:

```bash
/scripts/add-phone-notification-fields.sql
```

This will:
- Add phone number fields to `profiles` table
- Create `phone_verification_codes` table
- Set up Row Level Security policies
- Add necessary indexes

### 2. **Twilio Account Setup**

1. **Create a Twilio Account**
   - Go to [https://www.twilio.com/try-twilio](https://www.twilio.com/try-twilio)
   - Sign up for a free account (includes $15 credit)

2. **Get Your Credentials**
   - Navigate to: Console → Account Info
   - Copy:
     - Account SID
     - Auth Token

3. **Get a Phone Number** (for SMS)
   - Go to: Phone Numbers → Buy a Number
   - Select a number with SMS capabilities
   - Cost: ~$1/month + $0.0075 per SMS

4. **Enable WhatsApp (Optional)**
   - Go to: Messaging → Try it Out → Try WhatsApp
   - Follow the setup wizard
   - For production: Apply for WhatsApp Business API access

### 3. **Environment Variables**

Add to your `.env.local`:

```bash
# Twilio Configuration
TWILIO_ACCOUNT_SID=your_account_sid_here
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+15551234567  # Your Twilio SMS number
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886  # Twilio WhatsApp sandbox (or your approved number)
```

### 4. **Vercel Environment Variables**

Add the same variables to Vercel:
1. Go to: Project → Settings → Environment Variables
2. Add all 4 Twilio variables
3. Redeploy your app

---

## 💰 Cost Breakdown

### Twilio Pricing (US rates, 2026):
- **SMS**: $0.0075 per message sent
- **WhatsApp**: $0.005 per conversation (24-hour window)
- **Phone Number**: ~$1/month

### Example Monthly Costs:
- **100 users** × 5 notifications/month = 500 messages
  - SMS: 500 × $0.0075 = **$3.75/month**
  - WhatsApp: 500 × $0.005 = **$2.50/month**
  - Phone Number: **$1/month**
  - **Total: ~$5-7/month**

- **1,000 users** × 5 notifications/month = 5,000 messages
  - SMS: 5,000 × $0.0075 = **$37.50/month**
  - WhatsApp: 5,000 × $0.005 = **$25/month**
  - Phone Number: **$1/month**
  - **Total: ~$40-65/month**

### Cost Optimization Tips:
1. **WhatsApp is cheaper** than SMS (~33% savings)
2. **Batch notifications** in the same 24-hour WhatsApp window
3. **Only send SMS/WhatsApp to premium users** (already implemented)
4. **Monitor usage** via Twilio console

---

## 🎯 User Flow

### For Premium Users:

1. **Go to Profile → Settings**
2. **Verify Phone Number**
   - Enter phone number in E.164 format (e.g., +12025551234)
   - Click "Send Code"
   - Enter 6-digit verification code
   - Phone is verified ✅

3. **Enable Notifications**
   - Toggle "SMS Notifications" ON
   - Toggle "WhatsApp Notifications" ON
   - Both can be enabled simultaneously

4. **Receive Notifications**
   - When a trader closes a position
   - When a market resolves
   - Via SMS, WhatsApp, and/or Email

### For Free Users:
- See a premium upgrade prompt in notification settings
- Can still receive email notifications

---

## 📋 Testing Checklist

### Local Development:

1. **Test Phone Verification**
   ```bash
   # Start dev server
   npm run dev
   
   # Navigate to: http://localhost:3000/profile → Settings
   # Enter a test phone number
   # Verify you receive the SMS code
   ```

2. **Test SMS Notifications**
   ```bash
   # Trigger the cron job manually
   curl -X GET http://localhost:3000/api/cron/check-notifications \
     -H "Authorization: Bearer YOUR_CRON_SECRET"
   
   # Or wait for the next scheduled run (every 5 minutes on Vercel)
   ```

3. **Test WhatsApp (Sandbox)**
   - Join Twilio WhatsApp sandbox by texting the code shown in Twilio console
   - Enable WhatsApp notifications in settings
   - Trigger a notification

### Production Testing:

1. **Deploy to Vercel**
   ```bash
   git push origin feature/sms-whatsapp-notifications
   ```

2. **Verify Environment Variables** in Vercel Dashboard

3. **Test with Real Trades**
   - Copy a trade
   - Wait for trader to close position
   - Verify SMS/WhatsApp/Email are all sent

---

## 🚨 Important Notes

### WhatsApp Sandbox Limitations:
- **Sandbox is for testing only**
- Messages can only be sent to numbers that have opted in via the sandbox join flow
- For production: Apply for WhatsApp Business API approval

### Phone Number Format:
- **Must be E.164 format**: `+[country code][number]`
  - ✅ Correct: `+12025551234`
  - ❌ Wrong: `(202) 555-1234`, `2025551234`

### Rate Limits:
- **Twilio SMS**: 1 message per second (default)
- **Twilio WhatsApp**: 80 messages per second
- If you hit limits, implement a queue system

### Error Handling:
- If Twilio is not configured, the feature gracefully degrades
- SMS/WhatsApp failures don't block email notifications
- All errors are logged to console for debugging

---

## 🔍 Monitoring & Analytics

### Check Notification Logs:
```bash
# Vercel Logs
vercel logs --follow

# Look for:
# ✅ SMS sent to +12025551234
# ✅ WhatsApp sent to whatsapp:+12025551234
# ✅ Email sent to user@example.com
```

### Twilio Console:
- View all SMS/WhatsApp message logs
- Monitor usage and costs
- Check delivery status

### Database Queries:
```sql
-- Check verified phone numbers
SELECT email, phone_number, phone_verified, is_premium, notification_preferences
FROM profiles
WHERE phone_verified = true;

-- Check verification codes sent
SELECT * FROM phone_verification_codes
ORDER BY created_at DESC
LIMIT 20;
```

---

## 🎉 Feature Complete!

Once setup is complete, premium users will have:
- ✅ SMS notifications for position closures
- ✅ WhatsApp notifications for market resolutions
- ✅ Email notifications (default)
- ✅ Full control via Profile settings
- ✅ Phone number verification flow
- ✅ Secure, scalable architecture

---

## 📞 Support & Troubleshooting

### Common Issues:

**"SMS service not configured"**
- Check that `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` are set
- Verify environment variables are in Vercel

**"Invalid phone number format"**
- Ensure number is in E.164 format: `+12025551234`

**"Failed to send verification code"**
- Check Twilio account has credits
- Verify phone number is SMS-capable
- Check Twilio console logs for errors

**WhatsApp not working:**
- Verify user has joined WhatsApp sandbox (development)
- For production: Ensure WhatsApp Business API is approved

---

## 🚀 Next Steps (Optional Enhancements)

1. **Add phone number country code selector** (international support)
2. **Implement retry logic** for failed deliveries
3. **Add notification history page** (show all sent notifications)
4. **Support for custom notification templates** (user preferences)
5. **Notification scheduling** (quiet hours)
6. **A/B testing** SMS vs WhatsApp engagement rates

---

## 📚 File Reference

### Backend:
- `/lib/twilio/client.ts` - Twilio configuration
- `/lib/twilio/send-sms.ts` - SMS sending logic
- `/lib/twilio/send-whatsapp.ts` - WhatsApp sending logic
- `/lib/notifications/multi-channel.ts` - Multi-channel orchestration
- `/lib/notifications/sms-templates.ts` - SMS message templates
- `/app/api/phone/send-verification/route.ts` - Verification code API
- `/app/api/phone/verify-code/route.ts` - Code verification API
- `/app/api/phone/update-preferences/route.ts` - Preferences API
- `/app/api/cron/check-notifications/route.ts` - Updated cron job

### Frontend:
- `/components/polycopy/phone-notification-settings.tsx` - Settings UI
- `/app/profile/page.tsx` - Profile page integration

### Database:
- `/scripts/add-phone-notification-fields.sql` - Database schema

---

**Questions?** Open an issue or reach out to the team! 🎯

