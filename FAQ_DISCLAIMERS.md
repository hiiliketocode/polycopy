# FAQ Disclaimers - Legal Protection

## Standard Disclaimer Format

We'll use this consistent disclaimer box for any FAQ with investment/strategy/trading advice:

```jsx
<div className="bg-amber-50 border-2 border-amber-400 rounded-lg p-4 mb-4">
  <p className="text-sm font-semibold text-amber-900 mb-1">⚠️ Not Financial Advice</p>
  <p className="text-sm text-amber-900">
    This information is for educational purposes only and does not constitute financial, investment, or trading advice. 
    Polycopy does not recommend any specific traders, strategies, or investments. Always conduct your own research and 
    never risk more than you can afford to lose.
  </p>
</div>
```

---

## FAQs Requiring Disclaimers

### **EXISTING FAQs (Need to Add Disclaimers):**

#### 1. **"What are the risks of using Polycopy for Polymarket trading?"**
- **Why:** Discusses trading risks
- **Where:** Add disclaimer at the TOP of answer
- **Severity:** Medium priority

---

### **NEW FAQs (Add Disclaimers Before Publishing):**

#### 2. **"How do I know which traders are good to follow?"** ⚠️ HIGH PRIORITY
- **Why:** Could be seen as investment advice about choosing traders
- **Where:** Already included in draft at TOP
- **Note:** Draft already has disclaimer - keep it!

#### 3. **"Can I copy multiple traders at once?"**
- **Why:** Contains diversification strategy advice
- **Where:** Add disclaimer before "Best Practices for Multi-Trader Strategy" section
- **Severity:** Medium priority

---

## FAQs That Are SAFE (No Disclaimer Needed):

✅ **Pure Technical/How-To:**
- How do I create an account?
- How do I connect my wallet?
- What payment methods do you accept?
- How do I disconnect my wallet?
- How do I report a bug?
- Do I need cryptocurrency experience?

✅ **Platform Features (Not Advice):**
- What is Polycopy?
- How does Polycopy work?
- What is Manual Copy?
- What is Quick Copy?
- Can I manually sell my Quick Copied order?
- What happens when a trader closes their trade?
- What is slippage?
- Can I see my Polymarket trades?
- What's the difference between following vs copying? (factual, not advice)

✅ **Security/Transparency:**
- Does Polycopy have access to my private keys?
- What happens if Polycopy gets hacked?
- Can Polycopy steal my funds?
- How does Polycopy make money?

✅ **Billing/Account:**
- How much does Polycopy cost?
- Can I cancel my subscription?
- Can I upgrade/downgrade?
- What's the difference between free and premium?

✅ **General Info:**
- What markets does Polycopy support?
- Do you have a mobile app?
- How is Polycopy different from competitors? (comparison, not recommendation)

---

## Updated FAQ Drafts with Disclaimers

### 1. Update Existing: "What are the risks..." (Add to page.tsx)

```jsx
{
  category: 'Strategy & Risk',
  question: 'What are the risks of using Polycopy for Polymarket trading?',
  answer: (
    <div className="space-y-3">
      <div className="bg-amber-50 border-2 border-amber-400 rounded-lg p-4 mb-4">
        <p className="text-sm font-semibold text-amber-900 mb-1">⚠️ Not Financial Advice</p>
        <p className="text-sm text-amber-900">
          This information is for educational purposes only and does not constitute financial, investment, or trading advice. 
          Always conduct your own research and never risk more than you can afford to lose.
        </p>
      </div>

      <p>
        Prediction market trading carries inherent risks, and using Polycopy doesn't eliminate them. Here are key risks to understand:
      </p>

      <ul className="list-disc list-inside space-y-2 ml-4">
        <li><strong>No Guaranteed Returns:</strong> Past trader performance doesn't guarantee future results. Successful traders can underperform at any time.</li>
        <li><strong>Market Volatility:</strong> Polymarket markets move quickly. Prices may change between when a trader enters and when you copy.</li>
        <li><strong>Liquidity Risk:</strong> Some markets may have limited liquidity, making it harder to enter or exit positions.</li>
        <li><strong>Capital Loss:</strong> You can lose your entire investment in any single trade if the market resolves against your position.</li>
        <li><strong>Slippage:</strong> Fast-moving markets may result in different entry prices than expected.</li>
      </ul>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mt-3">
        <p className="text-sm text-amber-900">
          <strong>Risk Management Best Practices:</strong> Only trade what you can afford to lose, diversify across multiple traders and markets, 
          and ensure each copy aligns with your personal strategy and risk tolerance.
        </p>
      </div>
    </div>
  ),
},
```

---

### 2. Update New Draft: "Can I copy multiple traders at once?"

**Add this disclaimer before the "Best Practices" section:**

```jsx
<div className="bg-amber-50 border-2 border-amber-400 rounded-lg p-4 my-4">
  <p className="text-sm font-semibold text-amber-900 mb-1">⚠️ Not Financial Advice</p>
  <p className="text-sm text-amber-900">
    The following suggestions are educational only and do not constitute financial or investment advice. 
    Polycopy does not recommend any specific trading strategies. Make your own decisions based on your risk tolerance.
  </p>
</div>
```

**Updated Full FAQ:**

### **Can I copy multiple traders at once?**

**Yes! You can follow and copy as many traders as you want.**

**How it Works:**

**Following Multiple Traders:**
- Follow unlimited traders for free
- Their trades all appear in your unified feed
- Filter by trader, category, or time to manage your feed
- No limit on how many traders you can follow simultaneously

**Copying Multiple Trades:**
- **Free users:** Manually copy trades from as many traders as you want on Polymarket
- **Premium users:** Execute Quick Copy trades from multiple traders through Polycopy
- Each trade is independent - manage them separately in your portfolio
- No restriction on the number of active positions

<div className="bg-amber-50 border-2 border-amber-400 rounded-lg p-4 my-4">
  <p className="text-sm font-semibold text-amber-900 mb-1">⚠️ Not Financial Advice</p>
  <p className="text-sm text-amber-900">
    The following suggestions are educational only and do not constitute financial or investment advice. 
    Polycopy does not recommend any specific trading strategies. Make your own decisions based on your risk tolerance.
  </p>
</div>

**Best Practices for Multi-Trader Strategy:**

**1. Diversification:**
- Copy 3-5 traders with different specialties (politics, sports, crypto)
- Don't put all funds on one trader
- Spread risk across multiple strategies

**2. Position Sizing:**
- Set a maximum per-trade amount (e.g., $10-20 per copy)
- Never exceed your total risk tolerance across all copies
- Consider your wallet balance when copying multiple trades

**3. Organization:**
- Use the "Trades" tab on your profile to track all positions
- Monitor which traders are performing best for you
- Adjust your following list based on results

**4. Avoid Over-Copying:**
- Quality over quantity - don't copy every trade from every trader
- Be selective even with multiple traders
- Focus on markets you understand

**Example Strategy:**
- Follow: 10 traders across different categories
- Copy: 2-3 trades per day from your top performers
- Monitor: Check performance weekly
- Adjust: Unfollow underperformers, find new traders

**Premium Advantage:**
With Premium, you can:
- Quickly copy trades from different traders in seconds
- Set Auto-Close for positions across all traders
- Track all positions in one portfolio dashboard
- Execute faster before odds change

**Remember:** More traders ≠ better results. Focus on quality traders and selective copying.

---

## Summary

**Disclaimers Added to:**
1. ✅ "How do I know which traders are good to follow?" - Already has disclaimer in draft
2. ✅ "What are the risks of using Polycopy?" - Add disclaimer (shown above)
3. ✅ "Can I copy multiple traders at once?" - Add disclaimer (shown above)

**Total FAQs with disclaimers:** 3 out of 36 total FAQs

**Safe FAQs (no disclaimer):** 33 FAQs

---

## Next Steps

1. Update existing "risks" FAQ in current page.tsx
2. Ensure new drafts include disclaimers
3. Review with legal if available
4. Consider adding site-wide disclaimer in footer/terms
