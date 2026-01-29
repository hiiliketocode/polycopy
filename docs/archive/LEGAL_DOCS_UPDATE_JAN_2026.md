# Legal Documents Update - January 2026

## Overview
Updated Terms of Service and Privacy Policy to accurately reflect Polycopy's current functionality, including premium features, wallet connection via Turnkey, and trade execution capabilities.

**Last Updated:** January 9, 2026

---

## What Changed

### Terms of Service (`/app/terms/page.tsx`)

#### Major Updates:

1. **Section 2: Description of Service**
   - Added clear distinction between Free and Premium tiers
   - Free: Discovery, following, manual tracking
   - Premium: Direct trade execution, copy trading tools, auto-close positions, advanced controls
   - Added disclosure about future automated trading features
   - Clarified that premium users can execute trades through Polycopy interface

2. **Section 3: Account Registration and Eligibility**
   - Added subsection on Premium subscriptions ($10/month)
   - Clarified passwordless authentication via magic links
   - Added subscription cancellation terms

3. **NEW Section 4: Wallet Connection and Trade Execution**
   - **Critical:** Details how Turnkey handles private key management
   - Explicitly states Polycopy NEVER has access to unencrypted private keys
   - Explains client-side encryption process
   - Outlines trade execution authorization (user must explicitly click)
   - Covers wallet disconnection process
   - Security best practices for users

4. **Section 5: Enhanced Risk Warnings**
   - Expanded from 5 to 7 risk categories
   - Added technical risk disclosures (blockchain, third-party dependencies)
   - More explicit about timing differences in copy trading
   - Added no-endorsement clause for traders
   - Clarified we don't guarantee trade execution

5. **NEW Section 6: Acceptable Use Policy**
   - Moved from old Section 4
   - Expanded prohibited activities
   - Added restrictions on automated scraping

6. **Sections 7-9: Data, Financial Advice, Third-Party Services**
   - Enhanced third-party service disclosures
   - Added Turnkey, Stripe to third-party list
   - More detailed disclaimers about data accuracy

7. **NEW Section 11: Subscription Terms and Billing**
   - Detailed billing terms
   - Cancellation policy (no refunds for partial months)
   - Price change notification requirements
   - Payment failure consequences

8. **Section 12-13: Enhanced Legal Protections**
   - Expanded limitation of liability with specific scenarios
   - Added cap on liability ($100 or 12 months subscription fees, whichever greater)
   - Enhanced disclaimer of warranties

9. **NEW Section 14: Indemnification**
   - User indemnifies Polycopy for their trading decisions
   - Covers violations of terms, trading losses, etc.

10. **Section 17: Governing Law**
    - Changed from generic "United States" to **Delaware state law**
    - Added binding arbitration clause
    - Jury trial waiver
    - Class action waiver

11. **NEW Section 18: Miscellaneous**
    - Entire agreement, severability, waiver, assignment clauses
    - Force majeure provision

---

### Privacy Policy (`/app/privacy/page.tsx`)

#### Major Updates:

1. **Section 2.2: NEW - Wallet Information (Premium Users Only)**
   - **Critical:** Explicitly states we never collect/access private keys
   - Explains what we DO collect (public wallet address, Turnkey IDs)
   - Details Turnkey's role in private key management
   - Emphasizes client-side encryption

2. **Section 2.6: NEW - Payment Information**
   - Stripe customer ID collection
   - Subscription status tracking
   - Explicit statement: we don't store credit card info

3. **Section 3: Enhanced "How We Use Your Information"**
   - Added trade execution purposes (premium users)
   - Payment processing via Stripe
   - Security and fraud prevention
   - Legal compliance

4. **Section 4: Expanded Third-Party Services**
   - **4.2 NEW:** Turnkey (wallet infrastructure)
   - **4.3 NEW:** Stripe (payment processing)
   - Updated all service descriptions with privacy policy links
   - Added note about planned Mixpanel & marketing pixels

5. **Section 6: Enhanced Data Retention**
   - Separated retention policies by data type
   - Account data: deleted within 30 days of account deletion
   - Wallet data: deleted from our DB, but remains in Turnkey per their policy
   - Payment data: retained per Stripe and tax requirements
   - Added legal retention obligations

6. **Section 7: Enhanced Data Security**
   - Added specific security measures:
     - Encryption at rest
     - Private key security via Turnkey HSMs
     - PCI-DSS compliance (Stripe)
     - Security audits
   - Added user security responsibilities

7. **Section 8: Expanded Privacy Rights**
   - Added subsections for:
     - General rights
     - **8.2:** California CCPA rights
     - **8.3:** European GDPR rights
   - More detailed exercise instructions

8. **Section 11: Enhanced International Data Transfers**
   - Added Standard Contractual Clauses mention
   - Listed specific service provider locations
   - GDPR transfer safeguards

9. **NEW Sections:**
   - **Section 13:** Do Not Track Signals
   - **Section 14:** Data Breach Notification (72-hour commitment)
   - **Section 15:** Enhanced contact information with response time commitment

---

### Footer Disclaimer (`/app/components/Footer.tsx`)

**Changed:**
```diff
- By importing your wallet, you authorize Polycopy to 
- execute trades on your behalf based on the traders you follow.
+ Premium users who connect their wallet authorize Polycopy 
+ to execute trades on your behalf when you explicitly instruct us to do so.
+ You maintain full ownership of your wallet and funds at all times.
```

**Why:** Original language implied automated trading (not yet available). New language clarifies explicit user action required.

---

## Key Legal Protections Added

### 1. Private Key Security
- Multiple disclaimers that we NEVER access private keys
- Clear explanation of Turnkey's role
- Client-side encryption emphasis
- Reduces liability if user's wallet is compromised

### 2. Trading Risk Disclosures
- Comprehensive warnings about copy trading risks
- Timing differences, slippage, market volatility
- No guarantee of similar results
- Technical risks (blockchain, third-party failures)

### 3. Limitation of Liability
- Expanded to cover 10+ specific scenarios
- Liability cap: $100 or 12 months fees (whichever greater)
- Covers failed trades, wallet breaches, third-party failures

### 4. Jurisdiction and Arbitration
- Delaware law (well-established, business-friendly)
- Binding arbitration (reduces litigation costs)
- Class action waiver
- Jury trial waiver

### 5. Premium Subscription Terms
- Clear cancellation policy
- No refunds for partial months
- 30-day notice for price changes
- Failed payment = suspension/termination

### 6. Data Protection Compliance
- CCPA compliance (California)
- GDPR compliance (Europe)
- Data breach notification (72 hours)
- Standard Contractual Clauses for EU transfers

---

## Recommendations

### Immediate Actions:

1. ✅ **Review these changes carefully** - Make sure all disclosures match your actual practices
2. ✅ **Legal review** - Have a lawyer review before pushing to production (especially Delaware jurisdiction choice)
3. ⚠️ **Email existing users** - Material changes require 30-day notice per new Terms Section 15
4. ⚠️ **Update date references** - Changed to January 9, 2026 (or use your actual deployment date)

### Before Adding Automated Trading:

When you launch automated copy trading (where trades execute automatically without user clicking each time):

1. **Add explicit opt-in flow**
   - Separate authorization screen
   - Clear explanation of automation
   - List of traders being auto-copied
   - Position limits, daily trade limits, etc.

2. **Update Terms Section 2.3 & 4.2**
   - Change from "future features" to active feature
   - Add automation controls documentation
   - Risk disclosures about automatic execution

3. **Add kill switch / pause feature**
   - Let users pause all automated trading
   - Emergency stop for volatile markets

### Future Marketing Pixels:

Before adding Google/Meta/X tracking pixels:

1. **Update Privacy Policy Section 4.8**
   - Remove "planned" language
   - Add specific pixels being used
   - Link to opt-out mechanisms

2. **Cookie consent banner**
   - May be required for GDPR compliance
   - Let users opt-out of marketing cookies
   - Remember preferences

---

## Files Modified

1. ✅ `/app/terms/page.tsx` - Comprehensive Terms of Service update
2. ✅ `/app/privacy/page.tsx` - Comprehensive Privacy Policy update  
3. ✅ `/app/components/Footer.tsx` - Updated disclaimer language
4. ✅ `/LEGAL_DOCS_UPDATE_JAN_2026.md` - This summary document

---

## Testing Checklist

- [ ] Visit `/terms` - verify all sections render correctly
- [ ] Visit `/privacy` - verify all sections render correctly
- [ ] Check footer disclaimer on all pages
- [ ] Test on mobile (responsive design)
- [ ] Verify all internal links work (support email, Turnkey link, etc.)
- [ ] Verify external links open in new tabs
- [ ] Spell check all new content
- [ ] Have legal counsel review

---

## Compliance Notes

### Why Delaware Law?
- Most common choice for US tech companies
- Well-established body of corporate law
- Business-friendly courts
- Predictable outcomes

**Alternative:** If you incorporate in a different state, use that state's law instead.

### Arbitration Clause
- Reduces litigation costs (arbitration cheaper than court)
- Faster resolution
- Class action waiver protects against mass lawsuits
- Some jurisdictions limit enforceability - legal counsel should review

### Data Retention (30 days)
- GDPR requires deletion "without undue delay"
- 30 days is reasonable for technical implementation
- Backup copies may persist longer (disclosed in policy)

### Breach Notification (72 hours)
- GDPR requires notification within 72 hours
- Sets user expectation for transparency
- Demonstrates commitment to security

---

## Questions?

For questions about these legal documents:
- **Legal:** Consult your attorney
- **Technical:** Review code in `/lib/turnkey/` and `/app/api/turnkey/`
- **Product:** Verify all features match what's disclosed

---

**Document prepared by:** AI Assistant (Claude Sonnet 4.5)  
**Date:** January 9, 2026  
**Status:** Ready for legal review & deployment
