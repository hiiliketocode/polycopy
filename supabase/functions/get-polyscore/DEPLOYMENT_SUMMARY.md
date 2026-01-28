# PolyScore Edge Function - Deployment Summary

## ✅ What Has Been Created

1. **Main Function File**: `supabase/functions/get-polyscore/index.ts`
   - Complete Edge Function implementation
   - BigQuery ML model integration
   - Error handling and validation
   - CORS support

2. **Shared Utilities**: `supabase/functions/_shared/cors.ts`
   - CORS headers configuration
   - Reusable across all Edge Functions

3. **Documentation**:
   - `README.md` - Complete API documentation
   - `SETUP.md` - Google Cloud credentials setup guide
   - `DEPLOYMENT_SUMMARY.md` - This file

## 📋 Pre-Deployment Checklist

Before deploying, ensure you have:

- [ ] Installed Supabase CLI (`npm install -g supabase`)
- [ ] Logged into Supabase (`supabase login`)
- [ ] Linked your project (`supabase link --project-ref YOUR_REF`)
- [ ] Created Google Cloud service account with BigQuery permissions
- [ ] Set `GOOGLE_CLOUD_PROJECT_ID` secret in Supabase
- [ ] Set `GOOGLE_CLOUD_CREDENTIALS_JSON` secret in Supabase
- [ ] Verified BigQuery dataset `polycopy_v1` exists
- [ ] Verified BigQuery view `enriched_trades_v5_final` exists
- [ ] Verified BigQuery model `trade_predictor_v5` exists

## 🚀 Deployment Steps

### 1. Set Environment Variables

**Via Dashboard** (Recommended):
1. Go to Supabase Dashboard → Project Settings → Edge Functions → Secrets
2. Add `GOOGLE_CLOUD_PROJECT_ID` = your project ID
3. Add `GOOGLE_CLOUD_CREDENTIALS_JSON` = full JSON credentials string

**Via CLI**:
```bash
supabase secrets set GOOGLE_CLOUD_PROJECT_ID=your-project-id
supabase secrets set GOOGLE_CLOUD_CREDENTIALS_JSON='{"type":"service_account",...}'
```

### 2. Deploy the Function

```bash
cd /path/to/PolyCopy
supabase functions deploy get-polyscore
```

### 3. Verify Deployment

```bash
supabase functions list
```

You should see `get-polyscore` in the list.

### 4. Test the Function

```bash
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/get-polyscore \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -d '{
    "wallet_address": "0x6a72f61820b26b1fe4d956e17b6dc2a1ea3033ee",
    "condition_id": "0x1b09ac075e84860496aa9e11b7b6c63aec170a955cf3ee1fa0b4f383d4ba0a8c",
    "current_price": 0.6815,
    "user_slippage": 0.05
  }'
```

## 📍 Function Endpoint

Once deployed, your function will be available at:

```
https://YOUR_PROJECT_REF.supabase.co/functions/v1/get-polyscore
```

## 🔧 Integration in Your App

### Example: Calling from Next.js

```typescript
async function getPolyScore(tradeData: {
  wallet_address: string;
  condition_id: string;
  current_price: number;
  user_slippage: number;
}) {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/get-polyscore`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(tradeData),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.details || error.error);
  }

  return await response.json();
}
```

### Example: Using React Query

```typescript
import { useQuery } from '@tanstack/react-query';

function usePolyScore(tradeData: {
  wallet_address: string;
  condition_id: string;
  current_price: number;
  user_slippage: number;
}) {
  return useQuery({
    queryKey: ['polyscore', tradeData.wallet_address, tradeData.condition_id],
    queryFn: async () => {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/get-polyscore`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify(tradeData),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch PolyScore');
      }

      return response.json();
    },
    enabled: !!tradeData.wallet_address && !!tradeData.condition_id,
  });
}
```

## 📊 Expected Response Format

```typescript
interface PolyScoreResponse {
  poly_score: number;              // Overall score (1-100)
  alpha_score: number;             // Trader expertise (1-100)
  conviction_score: number;        // Trader confidence (1-100)
  value_score: number;             // Price value (1-100)
  ai_profit_probability: number;   // ML prediction (0-1)
  subtype_specific_win_rate: number;
  bet_type_specific_win_rate: number;
  position_adjustment_style: string;
  trade_sequence: number;
  is_hedged: number;
}
```

## 🐛 Troubleshooting

### Common Issues

1. **"Environment variable is required"**
   - Check secrets are set in Supabase dashboard
   - Verify secret names match exactly (case-sensitive)

2. **"Failed to parse JSON"**
   - Ensure entire JSON is pasted as single string
   - Validate JSON format

3. **"Trade not found"**
   - Verify wallet_address and condition_id exist in BigQuery
   - Check data sync status

4. **"Permission denied"**
   - Verify service account has BigQuery roles
   - Check dataset/model permissions

5. **Function timeout**
   - BigQuery queries can take 2-5 seconds
   - Consider increasing timeout if needed
   - Check BigQuery query logs for performance issues

## 📚 Additional Resources

- [Supabase Edge Functions Docs](https://supabase.com/docs/guides/functions)
- [Google Cloud BigQuery Docs](https://cloud.google.com/bigquery/docs)
- [BigQuery ML Docs](https://cloud.google.com/bigquery-ml/docs)

## 🔐 Security Notes

- All credentials stored in Supabase secrets (encrypted)
- Function validates all input parameters
- CORS headers configured for cross-origin requests
- No sensitive data in code or logs

## 💰 Cost Monitoring

- Monitor BigQuery usage in Google Cloud Console
- Set up budget alerts
- Consider caching frequently requested trades
- Average query cost: ~$0.01-0.05 per query (depends on data scanned)
