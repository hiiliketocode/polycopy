# WhatsApp Notifications - Production Readiness Checklist

## ✅ Completed Features

### 1. **WhatsApp Opt-In UX**
- ✅ "Open WhatsApp" button with pre-filled message
- ✅ QR code for mobile scanning
- ✅ Clear instructions and status indicators
- ✅ Auto-enable on successful opt-in

### 2. **Updated Notification Templates**
- ✅ Trader Closed Position:
  - Includes trader username, outcome, market title
  - Shows user's current ROI
  - **NEW**: Displays current market odds (YES/NO prices)
  - **NEW**: Actionable guidance (close now or wait)
  
- ✅ Market Resolved:
  - Shows market title
  - **NEW**: User's bet vs actual result
  - User's final ROI with emoji (🎉/😔)

### 3. **Backend Infrastructure**
- ✅ Multi-channel notification system (Email + WhatsApp)
- ✅ Premium-only access control
- ✅ Phone verification flow
- ✅ Preference management API
- ✅ Database schema for phone numbers and preferences

---

## 📋 Pre-Launch Checklist

### Testing (Now - Before Launch)

#### **Local/Sandbox Testing:**
- [ ] Test WhatsApp opt-in flow (button + QR code)
- [ ] Verify phone number manually in database
- [ ] Enable WhatsApp notifications
- [ ] Join Twilio WhatsApp sandbox
- [ ] Trigger test notifications:
  - [ ] Copy a trade
  - [ ] Wait for trader to close position
  - [ ] Verify WhatsApp message received
  - [ ] Check message formatting

#### **SQL Commands for Testing:**
```sql
-- Manually verify phone for testing
UPDATE profiles
SET 
  phone_number = '+19173749666',
  phone_verified = true,
  phone_verified_at = NOW(),
  notification_preferences = '{"email": true, "sms": false, "whatsapp": true}'::jsonb
WHERE email = 'michelsonbrad@gmail.com';
```

---

### Production Setup (3-7 Days Before Launch)

#### **Day 1-2: WhatsApp Business API Application**

1. **Create Meta Business Account**
   - Go to: [business.facebook.com](https://business.facebook.com)
   - Complete business verification
   - Upload business documents (EIN, business license, etc.)

2. **Apply for WhatsApp Business API**
   - Via Twilio: [console.twilio.com/whatsapp](https://console.twilio.com/whatsapp)
   - Or directly via Meta: [developers.facebook.com/products/whatsapp](https://developers.facebook.com/products/whatsapp)
   - Expected approval: 2-5 business days

3. **Required Documents:**
   - Business registration
   - Tax ID (EIN)
   - Business website (polycopy.app)
   - Business phone number
   - Business description

#### **Day 3-4: Get Production Phone Number**

1. **Buy WhatsApp-enabled number**
   - Twilio Console → Phone Numbers → Buy a Number
   - Filter: "WhatsApp" capability
   - Cost: ~$1/month + $0.005 per conversation

2. **Update environment variables:**
   ```bash
   TWILIO_WHATSAPP_NUMBER=whatsapp:+1YOUR_NEW_NUMBER
   ```

3. **Update in Vercel:**
   - Project → Settings → Environment Variables
   - Update `TWILIO_WHATSAPP_NUMBER`
   - Redeploy

#### **Day 5-6: Create & Submit Message Templates**

1. **Go to Meta Business Suite**
   - [business.facebook.com/wa/manage/message-templates](https://business.facebook.com/wa/manage/message-templates)

2. **Create Template 1: trader_closed_position**
   ```
   Name: trader_closed_position
   Category: UTILITY
   Language: English (US)

   Body:
   {{1}} closed their {{2}} position on "{{3}}". 

   Your current ROI: {{4}}
   Current Market Odds: {{5}}

   You can visit your profile now to close your position, or do nothing and wait for the market to resolve.

   Footer:
   Polycopy - Smart Trading Notifications

   Buttons:
   - Quick Reply: "View Trade"
   - URL: https://polycopy.app/profile
   ```

3. **Create Template 2: market_resolved**
   ```
   Name: market_resolved
   Category: UTILITY
   Language: English (US)

   Body:
   The trade you copied in market "{{1}}" has resolved:

   Your bet: {{2}}
   Result: {{3}}
   Your ROI: {{4}}

   Footer:
   Polycopy - Smart Trading Notifications

   Buttons:
   - Quick Reply: "View Trade"
   - URL: https://polycopy.app/profile
   ```

4. **Submit for approval** (24-48 hours)

#### **Day 7: Update Code for Production Templates**

Once templates are approved, you'll receive template IDs. Update the code:

```typescript
// lib/twilio/send-whatsapp.ts

import { twilioClient, config } from './client'

interface SendTemplateParams {
  to: string
  templateName: string
  templateVariables: string[]
}

export async function sendWhatsAppTemplate({ 
  to, 
  templateName, 
  templateVariables 
}: SendTemplateParams) {
  if (!twilioClient || !config.whatsappNumber) {
    return { success: false, error: 'WhatsApp service not configured' }
  }

  try {
    const whatsappTo = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`
    
    const result = await twilioClient.messages.create({
      from: config.whatsappNumber,
      to: whatsappTo,
      contentSid: process.env[`TWILIO_TEMPLATE_${templateName.toUpperCase()}_SID`],
      contentVariables: JSON.stringify(
        templateVariables.reduce((acc, val, idx) => {
          acc[`${idx + 1}`] = val
          return acc
        }, {} as Record<string, string>)
      ),
    })

    return { success: true, messageId: result.sid }
  } catch (error: any) {
    console.error('❌ Error sending WhatsApp template:', error.message)
    return { success: false, error: error.message }
  }
}
```

Add template SIDs to `.env.local` and Vercel:
```bash
TWILIO_TEMPLATE_TRADER_CLOSED_POSITION_SID=HX...
TWILIO_TEMPLATE_MARKET_RESOLVED_SID=HX...
```

---

### Production Launch Checklist

- [ ] WhatsApp Business API approved
- [ ] Production phone number configured
- [ ] Message templates approved
- [ ] Template SIDs added to environment variables
- [ ] Code updated to use templates (if desired)
- [ ] Tested on staging/preview environment
- [ ] Stripe Premium subscriptions live
- [ ] Monitoring/alerting set up for failed deliveries
- [ ] Customer support trained on WhatsApp opt-in process
- [ ] Terms of Service updated (WhatsApp notifications)
- [ ] Privacy Policy updated (phone number collection)

---

## 📱 Current Status (Sandbox)

**What works now:**
- ✅ Phone verification UI
- ✅ WhatsApp opt-in with button + QR code
- ✅ WhatsApp notifications (sandbox mode)
- ✅ Multi-channel delivery (Email + WhatsApp)
- ✅ Premium-only access
- ✅ Preference management

**Limitations:**
- ⚠️ Users must manually join sandbox
- ⚠️ Can only message verified numbers
- ⚠️ Sandbox number visible in messages
- ⚠️ Limited to 10 recipients

**Production benefits:**
- ✅ Professional business number
- ✅ No manual opt-in required
- ✅ Send to any number
- ✅ Unlimited recipients
- ✅ Better deliverability
- ✅ Rich media support

---

## 💰 Cost Breakdown

### Sandbox (Current - Free)
- $0 setup
- $0 per message (limited testing)

### Production
- **One-time:** $0 (API access is free)
- **Monthly fixed:** ~$1/month (phone number)
- **Per conversation:** $0.005 per 24-hour window
- **Example:** 1,000 users × 5 notifications/month = $25/month

---

## 🚀 Recommendation

**For Launch:**
1. ✅ Launch premium subscriptions with sandbox WhatsApp (works!)
2. ⏳ Apply for Business API immediately (3-7 days)
3. 📝 Submit templates while waiting for approval
4. 🎉 Switch to production once approved

**Why this approach:**
- Start generating revenue immediately
- Early adopters get preview access
- Time to apply for Business API while building user base
- Smooth transition to production

---

## 📞 Support Resources

- **Twilio Docs:** [twilio.com/docs/whatsapp](https://www.twilio.com/docs/whatsapp)
- **Meta Business Suite:** [business.facebook.com](https://business.facebook.com)
- **Template Guidelines:** [developers.facebook.com/docs/whatsapp/message-templates/guidelines](https://developers.facebook.com/docs/whatsapp/message-templates/guidelines)

---

**Questions or issues?** Refer to `SMS_WHATSAPP_SETUP.md` for detailed setup instructions!

