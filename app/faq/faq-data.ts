/**
 * FAQ Data - Polycopy
 * 
 * All FAQ content in a clean, maintainable format.
 * Separates content from presentation for easier updates.
 */

export interface FAQItem {
  id: string;
  category: string;
  question: string;
  answer: string;
  hasDisclaimer?: boolean;
  disclaimerText?: string;
}

export const FAQ_CATEGORIES = [
  'Getting Started',
  'Copy Trading',
  'Trading & Orders',
  'Strategy & Risk',
  'Wallet & Security',
  'Premium Features',
  'Account & Billing',
  'Technical & General',
] as const;

export type FAQCategory = typeof FAQ_CATEGORIES[number];

// Standard disclaimer for investment/strategy advice
export const STANDARD_DISCLAIMER = {
  title: '⚠️ Not Financial Advice',
  text: 'This information is for educational purposes only and does not constitute financial, investment, or trading advice. Always conduct your own research and never risk more than you can afford to lose.',
};

export const faqData: FAQItem[] = [
  // ============================================
  // GETTING STARTED
  // ============================================
  {
    id: 'what-is-polycopy',
    category: 'Getting Started',
    question: 'What is Polycopy?',
    answer: `Polycopy is a copy trading platform for Polymarket prediction markets. We help you discover and copy trades from successful Polymarket traders, allowing you to mirror their strategies and potentially benefit from their expertise.

We surface trades in your feed in near real-time so you can copy almost instantly and reduce slippage risk in fast-moving markets. Think of it like following expert investors on the stock market - except for prediction markets. You can see what the top performers are betting on and either manually copy their trades (free) or automatically execute them on Polycopy in two clicks (premium).`,
  },
  {
    id: 'need-polymarket-account',
    category: 'Getting Started',
    question: 'Do I need a Polymarket account to use Polycopy?',
    answer: `Yes. You need a funded Polymarket account (with USDC) and a Premium subscription to place trades via Polycopy. Free users can still browse, follow, and manually copy trades, but executing trades requires a funded Polymarket wallet.

**Note:** Quick Copy (premium) also requires connecting your Polymarket wallet to Polycopy.`,
  },
  {
    id: 'how-polycopy-works',
    category: 'Getting Started',
    question: 'How does Polycopy work?',
    answer: `Polycopy works in four simple steps:

1. **Discover Top Traders:** Browse our leaderboard to find successful traders based on their PnL, ROI, volume, and win rate.
2. **Follow Traders:** Follow traders you're interested in to see their trades in your personalized feed.
3. **Copy Trades:** When a followed trader makes a bet, copy it manually (free) or on Polycopy in two clicks (premium).
4. **Track Performance:** Monitor your copy trading performance and adjust your strategy over time.

All trading data comes from the Polygon blockchain and Polymarket's public APIs, ensuring transparency and accuracy.`,
  },
  {
    id: 'create-account',
    category: 'Getting Started',
    question: 'How do I create an account on Polycopy?',
    answer: `Creating a Polycopy account is quick and free:

1. **Visit Polycopy:** Go to [polycopy.app](https://polycopy.app)
2. **Click "Sign Up":** Find the button in the top right corner
3. **Choose Sign-In Method:**
   - **Google Sign-In (Recommended):** One-click authentication with your Google account
   - **Email/Password:** Create credentials manually
4. **Verify Email:** Check your inbox for a verification email (if using email/password method)
5. **Complete Profile:** Add optional details to personalize your experience
6. **Start Exploring:** Browse traders, follow interesting profiles, and explore the feed

**No Payment Required:** Creating an account is completely free. You only pay if you upgrade to Premium ($20/month) for advanced features like Quick Copy.

**Security:** We use industry-standard authentication and never store your payment information directly (handled by Stripe).`,
  },
  {
    id: 'need-crypto-experience',
    category: 'Getting Started',
    question: 'Do I need cryptocurrency experience to use Polycopy?',
    answer: `**No cryptocurrency experience required!**

Polycopy is designed to be accessible to everyone, regardless of crypto knowledge:

**What You Need to Know:**
- **USDC is just digital dollars:** USDC is a stablecoin - $1 USDC = $1 USD. It's simply US dollars on the blockchain.
- **Simple funding:** You can buy USDC with a credit card directly on Polymarket - no crypto exchange needed
- **No gas fees:** Polymarket uses a "gasless" system, so you don't need to understand gas fees or hold other cryptocurrencies
- **Easy wallet:** Polymarket creates a wallet for you automatically when you sign up - no complex wallet setup

**Free Features Require Zero Crypto:**
- Browse traders, view statistics, and follow traders without any crypto or wallet
- Manual copy trading just requires clicking links - Polymarket handles the crypto part

**Premium Features Made Simple:**
- We guide you through connecting your wallet step-by-step
- Everything happens in your browser - no complicated downloads
- Your crypto stays safe with Turnkey's bank-level security

**Think of it like this:** Using Polycopy is more like following stock traders than trading cryptocurrency. The blockchain aspect is handled behind the scenes.`,
  },
  {
    id: 'find-traders',
    category: 'Getting Started',
    question: 'How do I find traders to copy on Polycopy?',
    answer: `Use the [Discover page](/discover) to find and evaluate traders. Here's what you can do:

- **View Trending Traders:** See top performers ranked by their recent success
- **Filter by Category:** Find traders who specialize in specific markets (Politics, Sports, Crypto, etc.)
- **Analyze Performance:** Review detailed stats including PnL, ROI, volume, win rate, and trading history
- **Time Period Filters:** See performance over different timeframes (24h, 7d, 30d, all-time) to identify consistent traders
- **Sort by Metrics:** Rank traders by profit, ROI percentage, or trading volume to match your strategy

**Pro tip:** Look for traders with consistent performance across multiple time periods, not just short-term wins.`,
  },
  {
    id: 'which-traders-to-follow',
    category: 'Getting Started',
    question: 'How do I know which traders are good to follow?',
    answer: `**Key Metrics to Evaluate:**

**1. Consistency Over Time**
- Look for traders profitable across multiple time periods (7d, 30d, all-time)
- Avoid traders with one lucky week followed by losses
- Check their trading history - how long have they been active?

**2. Return on Investment (ROI)**
- High ROI with low volume might be luck
- Moderate ROI (20-40%) with high volume often indicates skill
- Compare ROI across different timeframes for consistency

**3. Win Rate**
- A 60%+ win rate is generally solid
- Very high win rates (90%+) might indicate small position sizes or cherry-picking easy markets
- Balance win rate with average profit per trade

**4. Trading Volume**
- Higher volume shows the trader is actively engaged
- More trades = larger sample size to evaluate skill
- Look for at least 20-50 trades before following

**5. Market Categories**
- Does the trader specialize in markets you understand?
- Do they trade politics, sports, crypto, or a mix?
- Specialization in one category might indicate expertise

**6. Recent Performance**
- How have they performed in the last 7-30 days?
- Markets change - recent success matters more than ancient history

**Red Flags to Avoid:**
- Traders with no recent activity (30+ days)
- Extreme volatility (massive wins followed by massive losses)
- Very few trades but high profits (likely luck, not skill)
- Trading only low-liquidity markets (harder to copy)

**Best Practice:**
- **Diversify** - Follow 3-5 traders, not just one
- **Start small** - Test copying with small amounts first
- **Monitor performance** - Review results weekly and adjust
- **Trust your judgment** - If something seems too good to be true, it probably is

**Remember:** Past performance does not guarantee future results. Every trader can have losing streaks.`,
    hasDisclaimer: true,
    disclaimerText: 'This is educational information only. Polycopy does not provide financial advice. Always do your own research and never risk more than you can afford to lose.',
  },

  // ============================================
  // COPY TRADING
  // ============================================
  {
    id: 'following-vs-copying',
    category: 'Copy Trading',
    question: "What's the difference between following and copying a trader?",
    answer: `These are **two distinct actions** with different outcomes:

**Following a Trader:**
- **What it does:** Adds the trader to your personalized feed
- **What you see:** Their trades appear in your feed when they place them
- **Cost:** Free for all users
- **Trading:** You must manually decide whether to copy each trade
- **Use case:** Research traders, watch their activity, learn their strategy

Think of following like: Subscribing to someone on social media - you see their posts but don't automatically do what they do.

**Copying a Trade:**
- **What it does:** Actually executes the same trade with your funds
- **What happens:** You open a position on the same market/outcome
- **Cost:** Free tier = manual copy (you execute on Polymarket); Premium = Quick Copy (executed through Polycopy)
- **Trading:** You're now invested with real money
- **Use case:** Putting your money on the same trade as the trader

Think of copying like: Actually making the same investment - you have skin in the game.

**The Flow:**
1. **Follow** a trader → See their trades in your feed
2. **Decide** which trades to copy (don't have to copy everything)
3. **Copy** individual trades → Invest your money

**Important Notes:**
- Following does NOT automatically copy trades - you must manually copy each one
- You can follow unlimited traders for free
- You choose which trades to copy - you're not locked into copying everything
- Following lets you evaluate a trader before risking money

**Example:**
- You follow 10 traders (free)
- Their trades appear in your feed
- You manually copy 2 trades from Trader A today (your choice)
- You skip trades from the other 9 traders
- Tomorrow, you might copy different traders`,
  },
  {
    id: 'manual-copy',
    category: 'Copy Trading',
    question: 'What is Manual Copy and how do I use it? (Free Feature)',
    answer: `Manual Copy is our free feature that lets you replicate trades from traders you follow. Here's how it works:

1. **Find a Trade:** See a trade you like in your feed from a followed trader
2. **Click "Manual Copy":** This opens a new tab taking you directly to the Polymarket market for that trade
3. **Execute on Polymarket:** Log into Polymarket (if not already logged in) and manually place the bet with your desired amount
4. **Return to Polycopy:** Come back to Polycopy and click "Mark as Copied"
5. **Enter Trade Details:** Fill in your Entry Price (price per contract) and Amount Invested (dollar amount you bet)
6. **Confirm:** Click confirm and your trade will now be visible in your portfolio under the "Trades" tab

**Note:** Manual Copy requires you to have a Polymarket account and execute trades yourself on their platform. It's perfect for getting started with copy trading without connecting your wallet.`,
  },
  {
    id: 'quick-copy',
    category: 'Copy Trading',
    question: 'What is Quick Copy and how does it work? (Premium Feature)',
    answer: `Quick Copy is a premium feature that lets you execute copy trades directly on Polycopy - no need to leave the platform or manually enter trade details.

**How it works:**
1. See a trade in your feed from a followed trader
2. Click "Quick Copy" button
3. Review pre-filled trade parameters (outcome, amount, slippage)
4. Input the dollar amount for your copy trade
5. Adjust settings if desired (see advanced features below)
6. Click "Execute Trade" - done!

We show the current fill price automatically; only update it if it has changed.

**Advanced Features Available:**
- **Custom Slippage:** Set how much price movement you'll tolerate (default is optimized for you)
- **Fill or Kill (FoK):** Execute the trade fully at your price or cancel it entirely
- **Limit Orders:** Set a maximum price you're willing to pay (full manual controls coming soon)
- **Auto-Close Positions:** Automatically close your position when the trader you copied exits
- **Position Sizing:** Customize how much you want to invest per trade`,
  },
  {
    id: 'manually-sell-quick-copy',
    category: 'Copy Trading',
    question: 'Can I manually sell my Quick Copied order?',
    answer: `Yes. Premium users can manually sell a Quick Copy position anytime (market conditions allowing).

1. Go to your portfolio and open the **Trades** page
2. Find the copied trade you want to exit
3. Click **Sell** and confirm the order

If the market is illiquid or halted, you may need to wait for a fill or try again later.`,
  },
  {
    id: 'trader-closes-position',
    category: 'Copy Trading',
    question: 'What happens when a trader I copied closes their trade before a market resolves?',
    answer: `If a trader you are copying closes their trade before the market resolves, Polycopy will send you an email letting you know.

Users with premium subscriptions can enable the Auto-Close feature during a Quick Trade to automatically close a position when the trader they copied closes theirs.

**How Auto-Close Works:**
1. During the Quick Copy process, check the "Auto-Close Position" option
2. Execute your copy trade as normal
3. Polycopy monitors the trader's position
4. When they close/exit their position, Polycopy automatically closes yours at the current market price
5. You realize your profit or loss immediately, matching the trader's exit timing

**Why use Auto-Close?** Many successful traders exit positions early to lock in profits before market resolution. Auto-Close ensures you follow their complete strategy, including their exit timing - a critical part of their success.`,
  },
  {
    id: 'copy-multiple-traders',
    category: 'Copy Trading',
    question: 'Can I copy multiple traders at once?',
    answer: `**Yes! You can follow and copy as many traders as you want.**

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
- Use the "Trades" tab on your portfolio to track all positions
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

**Remember:** More traders ≠ better results. Focus on quality traders and selective copying.`,
    hasDisclaimer: true,
    disclaimerText: 'The following suggestions are educational only and do not constitute financial or investment advice. Polycopy does not recommend any specific trading strategies. Make your own decisions based on your risk tolerance.',
  },

  // ============================================
  // TRADING & ORDERS
  // ============================================
  {
    id: 'what-is-slippage',
    category: 'Trading & Orders',
    question: 'What is slippage?',
    answer: `Slippage is the difference between the price you expect and the price you actually get. In fast-moving Polymarket markets, prices can change quickly while your order is being placed.

Polycopy focuses on speed to help reduce slippage, but it can still happen when liquidity is thin or the market moves fast.`,
  },
  {
    id: 'minimum-order-size',
    category: 'Trading & Orders',
    question: 'What is the minimum order size?',
    answer: `The minimum is usually $1, but it may vary by market conditions. If your order is below the minimum, Polycopy will show you the exact minimum for that market.`,
  },
  {
    id: 'contract-amount-different',
    category: 'Trading & Orders',
    question: 'Why is the contract amount different from the one I entered?',
    answer: `Prices move quickly, so we may adjust the contract amount to stay close to the live price, keep it above the market minimum, and round to valid contract increments.

The goal is to place the closest valid order without it being rejected by the market.`,
  },
  {
    id: 'fok-vs-gtc',
    category: 'Trading & Orders',
    question: "What's the difference between Fill or Kill (FoK) and Good to Cancel (GTC)?",
    answer: `**Fill or Kill** means the order must fill completely right away or it cancels. **Good to Cancel** keeps the order open until it fills or you cancel it.

Most users prefer FoK because Polymarket markets move fast and they want to avoid stale orders.`,
  },
  {
    id: 'limit-orders',
    category: 'Trading & Orders',
    question: 'Can I enter limit orders?',
    answer: `All Polymarket orders are limit orders by design, and Polycopy tries to get you the best available price at the time of execution.

Full manual limit controls are coming soon.`,
  },
  {
    id: 'see-polymarket-trades',
    category: 'Trading & Orders',
    question: 'Can I see my Polymarket trades on Polycopy?',
    answer: `Polycopy only shows trades made or marked as traded on Polycopy. Polycopy users can see their manual and Quick Copy trades on the "Trades" tab of the portfolio page. Polymarket trades executed on platforms other than Polycopy do not display on Polycopy.`,
  },

  // ============================================
  // STRATEGY & RISK
  // ============================================
  {
    id: 'trading-risks',
    category: 'Strategy & Risk',
    question: 'What are the risks of using Polycopy for Polymarket trading?',
    answer: `Prediction market trading carries inherent risks, and using Polycopy doesn't eliminate them. Here are key risks to understand:

- **No Guaranteed Returns:** Past trader performance doesn't guarantee future results. Successful traders can underperform at any time.
- **Market Volatility:** Polymarket markets move quickly. Prices may change between when a trader enters and when you copy.
- **Liquidity Risk:** Some markets may have limited liquidity, making it harder to enter or exit positions.
- **Capital Loss:** You can lose your entire investment in any single trade if the market resolves against your position.
- **Slippage:** Fast-moving markets may result in different entry prices than expected.

**Risk Management Best Practices:** Only trade what you can afford to lose, diversify across multiple traders and markets, and ensure each copy aligns with your personal strategy and risk tolerance.`,
    hasDisclaimer: true,
  },

  // ============================================
  // WALLET & SECURITY
  // ============================================
  {
    id: 'connect-wallet',
    category: 'Wallet & Security',
    question: 'How do I connect my Polymarket wallet to Polycopy?',
    answer: `Connecting your wallet is required for Premium features (Quick Copy, direct trade execution). Here's the step-by-step process:

1. **Subscribe to Premium:** Open Settings and upgrade to Premium ($20/month)
2. **Navigate to Portfolio:** Click "Connect Wallet" to begin
3. **Enter Your Polymarket Address:** Visit Polymarket and copy your wallet address, then paste it into Polycopy
4. **Import Private Key (Secure):** Enter your Polymarket wallet's private key
5. **Turnkey Encryption:** Your private key is encrypted client-side in your browser using Turnkey's secure encryption
6. **Secure Storage:** The encrypted key is sent directly to Turnkey's infrastructure (not Polycopy's servers)
7. **Verification:** Confirm your wallet is connected - you're ready to use Quick Copy!

**Security Guarantee:**
- **Polycopy NEVER sees your unencrypted private key**
- Your key is encrypted in your browser before transmission
- Only Turnkey (enterprise wallet security provider) stores your encrypted key
- We only store your public wallet address in our database

**What is Turnkey?** Turnkey is a professional Web3 infrastructure company specializing in secure wallet management. They use bank-level encryption (TEE/HSM) and are trusted by thousands of applications. Learn more at [turnkey.com](https://www.turnkey.com)`,
  },
  {
    id: 'private-key-access',
    category: 'Wallet & Security',
    question: 'Does Polycopy have access to my private keys?',
    answer: `**No. Polycopy NEVER has access to your private keys.**

Here's exactly how we ensure your private key stays secure:

**1. Client-Side Encryption**
Your private key is encrypted directly in your browser using Turnkey's encryption library before it ever leaves your device.

**2. Zero Access**
The encrypted bundle passes through our server only momentarily for routing to Turnkey - we cannot decrypt it and never store it.

**3. Turnkey Secure Storage**
Your encrypted private key is stored exclusively on Turnkey's infrastructure using Hardware Security Modules (HSMs) and Trusted Execution Environments (TEEs).

**4. We Only Store Your Address**
Polycopy's database only contains your public wallet address (e.g., 0x1234...) and a reference to your Turnkey wallet ID. Public addresses are already visible on the blockchain.

**Analogy:** It's like using Apple Pay - you enter your card once, Apple encrypts it securely, and you can pay later without Apple seeing your actual card number. Same concept with Polycopy and Turnkey.

**Additional Security:** Even Turnkey uses zero-knowledge architecture, meaning they can sign transactions on your behalf but cannot decrypt and view your private key either.`,
  },
  {
    id: 'if-polycopy-hacked',
    category: 'Wallet & Security',
    question: 'What happens if Polycopy gets hacked?',
    answer: `Your private key and funds remain secure. Here's what would and wouldn't be at risk:

**What Could Be Accessed:**
- Your email address
- Your public wallet address
- Your copied trades history
- Your subscription status
- Traders you follow

**What CANNOT Be Accessed:**
- **Your private key** (stored on Turnkey, not Polycopy)
- **Your funds** (secured by Turnkey's infrastructure)
- Payment card details (stored by Stripe, not us)

**Why?** Your private key never touches our servers. It's encrypted in your browser and sent directly to Turnkey's secure, SOC 2 Type II certified infrastructure. Even if our entire database was compromised, attackers would find no private keys.

**Security Best Practice:** Always use a unique, strong password for your Polycopy account and enable two-factor authentication on your email.`,
  },
  {
    id: 'can-polycopy-steal',
    category: 'Wallet & Security',
    question: 'Can Polycopy steal my funds or make unauthorized trades?',
    answer: `**No.**

While we can execute trades on your behalf (that's the feature!), there are multiple safeguards preventing unauthorized activity:

**1. Explicit Authorization Required**
Trades only execute when you explicitly click "Quick Copy" or enable auto-copy for specific traders. We don't have blanket permission to trade whenever we want.

**2. Blockchain Transparency**
Every trade is publicly visible on the Polygon blockchain. If we made unauthorized trades, they would be immediately visible and traceable back to us.

**3. Turnkey Monitoring**
Even we must request Turnkey to sign transactions. Turnkey monitors for suspicious activity and unusual patterns.

**4. Instant Revocation**
You can disconnect your wallet anytime from your settings page, immediately revoking our ability to execute trades.

**Our Business Model:** We make money from $20/month subscriptions, not from your trades or funds. Stealing from users would destroy our reputation and company instantly. We're building a long-term business based on trust and transparency.`,
  },
  {
    id: 'disconnect-wallet',
    category: 'Wallet & Security',
    question: 'How do I disconnect my wallet from Polycopy?',
    answer: `You can disconnect your wallet anytime from your settings page. Here's how:

1. Open Settings (top-right cog) and select Account
2. Scroll to Wallet connection
3. Click Disconnect and confirm

**What happens when you disconnect:**
- Your wallet address is removed from your Polycopy account
- Your encrypted private key is permanently deleted from Turnkey's secure infrastructure
- You can no longer use Quick Copy or execute trades through Polycopy
- Your manual copy trade history remains intact
- You can reconnect the same or a different wallet anytime

**Note:** If you cancel your Premium subscription, your wallet is automatically disconnected and your credentials are deleted from Turnkey.`,
  },

  // ============================================
  // PREMIUM FEATURES
  // ============================================
  {
    id: 'free-vs-premium',
    category: 'Premium Features',
    question: "What's the difference between Polycopy's free and premium tiers?",
    answer: `Polycopy offers two tiers to match your copy trading needs:

**FREE:**
- Discover & Browse Traders ✓
- Follow Traders ✓
- View Leaderboards ✓
- Manual Copy (Trade on Polymarket) ✓
- Track Manual Copies ✓

**PREMIUM ($20/mo):**
- Everything in Free ✓
- Quick Copy (1-Click Trading) ✓
- Execute Trades Directly ✓
- Auto-Close Positions ✓
- Advanced Trade Controls ✓
- Custom Slippage ✓
- Fill or Kill (FoK) ✓
- Portfolio Tracking ✓
- Early Access to Features ✓
- Limit Orders (Coming soon)

**Which plan is right for you?**

**Choose Free if:** You want to explore copy trading, manually execute trades on Polymarket, and track your copies without connecting your wallet.

**Choose Premium if:** You want the fastest, easiest copy trading experience with one-click execution, auto-close features, and advanced trade controls.`,
  },
  {
    id: 'execute-trades-on-polycopy',
    category: 'Premium Features',
    question: 'Can I execute Polymarket trades on Polycopy?',
    answer: `**Yes - if you're a Premium subscriber!**

Premium users can execute Polymarket trades directly from Polycopy's interface without leaving the platform. This includes both copy trades and independent trades you want to make yourself.

**Why Trade Through Polycopy?**
- **Speed:** Execute copy trades in seconds without switching tabs
- **Pre-filled Parameters:** Trade details auto-populate based on the trader you're copying
- **Advanced Controls:** Custom slippage and Fill or Kill options (full limit order controls coming soon)
- **Auto-Close:** Set positions to automatically close when copied traders exit
- **Portfolio Tracking:** All trades automatically logged and tracked in your dashboard
- **Seamless Experience:** Stay in one platform for discovery, analysis, and execution

**Requirements:** Premium subscription ($20/month) and connected Polymarket wallet via Turnkey secure infrastructure.

**Free users** can still copy trades manually by clicking "Manual Copy" which opens Polymarket in a new tab.`,
  },
  {
    id: 'payment-methods',
    category: 'Premium Features',
    question: 'What payment methods do you accept?',
    answer: `Polycopy uses **Stripe** for secure payment processing:

**Accepted Payment Methods:**
- Credit Cards: Visa, Mastercard, American Express, Discover
- Debit Cards: Most major debit cards
- Digital Wallets: Apple Pay, Google Pay (depending on your device)

**How Billing Works:**
- **Subscription model:** $20/month, charged automatically
- **Billing date:** Same date each month (e.g., subscribe Jan 15 = charged 15th every month)
- **Currency:** USD (US Dollars)
- **Automatic renewal:** Your card is charged monthly until you cancel

**Payment Security:**
- **PCI-DSS Level 1 Certified:** Stripe meets the highest security standards
- **We never see your card:** Stripe processes all payments - Polycopy never stores your card details
- **Encrypted transactions:** All payment data is encrypted end-to-end
- **Fraud protection:** Stripe's advanced fraud detection protects your account

**Billing Management:**
- Update your payment method anytime in Settings
- View payment history and download invoices
- Cancel subscription anytime (no penalty)

**International Payments:**
- Stripe supports most countries worldwide
- Your bank may charge currency conversion fees if outside the US
- Check with your bank about international transaction fees

**Payment Failed?**
If a payment fails:
1. Check your card has sufficient funds
2. Verify your card hasn't expired
3. Contact your bank (they may be blocking the transaction)
4. Update your payment method in Settings
5. Contact our support if issues persist: [@polycopyapp on X](https://twitter.com/polycopyapp)

**Note:** We do not currently accept cryptocurrency for subscriptions - only traditional payment methods via Stripe.`,
  },

  // ============================================
  // ACCOUNT & BILLING
  // ============================================
  {
    id: 'pricing',
    category: 'Account & Billing',
    question: 'How much does Polycopy cost?',
    answer: `**Free: $0/month**
- Discover and browse traders
- Follow unlimited traders
- View leaderboards and stats
- Manual copy tracking

**Premium: $20/month**
- Quick Copy - 1-click trade execution
- Auto-Close positions
- Advanced controls (slippage, limits, FoK)
- Portfolio tracking
- Early access to new features

**Simple Pricing:** We charge a flat monthly fee - no per-trade fees, no profit sharing, no hidden costs. You keep 100% of your trading profits.`,
  },
  {
    id: 'cancel-subscription',
    category: 'Account & Billing',
    question: 'Can I cancel my subscription?',
    answer: `**Yes, anytime - with zero hassle.**

**How to cancel:**
1. Open Settings (top-right cog) and select Account
2. Scroll to Membership & Wallet
3. Click "Cancel Subscription"
4. Confirm cancellation

**What happens when you cancel:**
- You keep Premium access until the end of your current billing period
- Your wallet and encrypted credentials are automatically disconnected and deleted from Turnkey
- Your access to Premium features will end at the beginning of your next billing cycle
- No cancellation fees or penalties
- You can re-subscribe anytime

**Need help?** Contact support at [support@polycopy.app](mailto:support@polycopy.app)`,
  },
  {
    id: 'upgrade-downgrade',
    category: 'Account & Billing',
    question: 'Can I upgrade or downgrade my plan?',
    answer: `**Upgrading (Free → Premium):**

You can upgrade to Premium anytime! Here's what happens:

**How to Upgrade:**
1. Open Settings (top-right cog) and select Account
2. Click "Upgrade to Premium" or "Get Premium"
3. Enter your payment details via Stripe
4. Instant access to all Premium features

**Immediate Benefits:**
- Quick Copy unlocked instantly
- Connect your Polymarket wallet
- Execute trades directly on Polycopy
- Auto-Close positions
- Advanced trade controls
- Portfolio tracking

**Billing:**
- Charged $20 immediately
- Renews monthly on the same date
- Example: Upgrade Jan 15 = charged Jan 15, Feb 15, Mar 15, etc.

**Pro-rated?** No - you pay the full $20 when you upgrade, regardless of the date

---

**Downgrading (Premium → Free):**

You can downgrade by canceling your subscription:

**How to Downgrade:**
1. Open Settings (top-right cog) and select Account
2. Scroll to Membership & Wallet
3. Click "Cancel Subscription"
4. Confirm cancellation

**What Happens:**
- Keep Premium access until the end of your current billing period
- Manual copy and following remain available (always free)
- Lose Quick Copy access after billing period ends
- Wallet automatically disconnected and credentials deleted
- Cannot execute trades through Polycopy anymore

**Example Timeline:**
- Subscribed: Jan 1 (charged $20)
- Cancel: Jan 20
- Premium ends: Feb 1 (when next charge would have been)
- Feb 1+: Reverted to free tier

**Can I Re-Upgrade?**
- Yes! Upgrade again anytime
- Re-enter payment details
- Reconnect your wallet
- Immediate Premium access restored

**Need Help?**
Contact support if you have billing questions: [@polycopyapp on X](https://twitter.com/polycopyapp)`,
  },
  {
    id: 'fund-polymarket-wallet',
    category: 'Account & Billing',
    question: 'How do I fund my Polymarket wallet?',
    answer: `To trade on Polymarket (and use Polycopy's copy trading features), you need USDC in your Polymarket wallet. Here's how to fund it:

For Polymarket's own funding guide, see [the Polymarket FAQ](https://legacy-docs.polymarket.com/faq).

**Option 1: Direct Deposit (Easiest)**
1. Go to [Polymarket.com](https://polymarket.com)
2. Log into your Polymarket account
3. Click "Deposit" in the top right
4. Choose your funding method:
   - **Credit/Debit Card:** Instant, small fees (~3-5%)
   - **Bank Transfer:** Lower fees, takes 1-3 days
   - **Crypto Transfer:** Send USDC from another wallet
5. Enter amount and confirm

**Option 2: Crypto Transfer (For Crypto Users)**
1. Copy your Polymarket wallet address from Polymarket
2. Send USDC on **Polygon network** to that address
3. Wait for confirmation (usually 1-2 minutes)
4. Your balance will update automatically

⚠️ **Important:** Make sure to send USDC on the **Polygon network**, not Ethereum mainnet. Sending on the wrong network may result in lost funds.

**No Gas Fees:** Polymarket uses a "gasless" system, so you don't need MATIC tokens for gas fees. You only need USDC to place bets!

**Minimum Deposit:** Most funding methods have a $10-20 minimum. Check Polymarket's deposit page for current limits.`,
  },

  // ============================================
  // TECHNICAL & GENERAL
  // ============================================
  {
    id: 'supported-markets',
    category: 'Technical & General',
    question: 'What markets does Polycopy support?',
    answer: `**Polycopy supports all markets available on Polymarket.**

This includes prediction markets across multiple categories:

- **Politics:** Elections, approval ratings, policy outcomes, political events
- **Sports:** Game outcomes, player performances, season results, championships
- **Crypto:** Bitcoin/Ethereum prices, DeFi protocols, crypto regulations, token launches
- **Business:** Stock prices, company earnings, IPOs, mergers & acquisitions
- **Entertainment:** Award shows, box office results, streaming metrics
- **Science & Technology:** AI developments, space missions, scientific breakthroughs
- **Current Events:** News events, global incidents, trending topics

**How it works:**
- When a trader you follow makes a bet on any Polymarket market, it will appear in your Polycopy feed
- You can copy trades from any market category
- Filter by category on the Discover page to find traders specializing in specific markets

**New Markets:** As Polymarket adds new markets and categories, they automatically become available on Polycopy. No action needed - you can copy trades from any new market instantly.

Learn more about Polymarket markets: [Visit Polymarket](https://polymarket.com)`,
  },
  {
    id: 'polycopy-vs-competitors',
    category: 'Technical & General',
    question: 'How is Polycopy different from other copy trading platforms?',
    answer: `Polycopy is purpose-built for **Polymarket prediction markets** with unique features you won't find elsewhere:

**Polymarket-Specific:**
- **Only platform focused on Polymarket:** We specialize in prediction market copy trading, not forex or stocks
- **Real-time trade feed:** See trades as they hit the blockchain - copy within seconds
- **Market context:** Integrated market data, odds, and ESPN scores for sports markets
- **Prediction market expertise:** We understand Polymarket's unique mechanics (CLOB, tick sizes, liquidity)

**Speed & Execution:**
- **Sub-second trade detection:** Our system indexes trades faster than competitors
- **Direct Polymarket integration:** Execute trades through Polymarket's official CLOB API
- **Minimal slippage:** Copy trades before odds move significantly
- **Auto-close positions:** Automatically exit when the trader you copied exits

**Security First:**
- **Turnkey infrastructure:** Bank-level wallet security (TEE/HSM encryption)
- **Zero-knowledge architecture:** We never see your unencrypted private keys
- **Open security model:** Transparent about how we protect your funds
- **SOC 2 Type II:** Turnkey is professionally certified for security

**User Experience:**
- **Clean, modern interface:** Built for 2026, not 2015
- **Mobile-optimized:** Works seamlessly on phone and desktop
- **Beginner-friendly:** No crypto expertise required
- **Free tier available:** Browse and manually copy for free

**Transparency:**
- **Public blockchain data:** All trades verified on Polygon
- **No hidden fees:** Flat $20/month, no per-trade fees or profit sharing
- **Trader statistics:** Comprehensive performance metrics (ROI, win rate, volume)
- **Open roadmap:** We share what we're building

**The Bottom Line:**
If you want to copy trade on **Polymarket specifically**, Polycopy is built for you. Other platforms either don't support prediction markets or lack our speed, security, and specialized features.

**What we're NOT:**
- Not a general trading bot (we only do Polymarket)
- Not an investment advisor (you make your own decisions)
- Not a guaranteed profit system (all trading has risk)`,
  },
  {
    id: 'report-bug',
    category: 'Technical & General',
    question: 'How do I report a bug or issue?',
    answer: `Found a bug or experiencing an issue? We want to hear about it!

**Best Way to Report Issues:**

**Contact us on X (Twitter):**
- Direct Message: [@polycopyapp](https://twitter.com/polycopyapp)
- Public mention: Tweet @polycopyapp with details
- Response time: Usually within a few hours during business hours

**What to Include in Your Report:**

To help us fix issues quickly, please provide:

**1. Clear Description:**
- What were you trying to do?
- What actually happened?
- What did you expect to happen?

**2. Steps to Reproduce:**
- Numbered steps we can follow to see the issue
- Example: "1. Click Quick Copy, 2. Enter $5, 3. Click Execute, 4. Error appears"

**3. Error Messages:**
- Take a screenshot if possible
- Copy/paste any error text
- Check browser console (F12 → Console tab) for technical errors

**4. Context:**
- Your browser (Chrome, Safari, Firefox, etc.)
- Device (Desktop, iPhone, Android)
- Account type (Free or Premium)
- When did it start happening?

**5. Impact:**
- Is it blocking you completely?
- Or just an annoyance?

**Example Good Bug Report:**
"Hi @polycopyapp! Bug report: When I try to Quick Copy a trade for $10, the modal closes immediately without executing. Steps: 1) Click Quick Copy on any trade, 2) Enter $10, 3) Click Execute. Expected: Trade executes. Actual: Modal closes, no trade placed. Using Chrome on Mac. Started today. Premium user. Screenshot attached."

**Emergency Issues:**
- Wallet security concerns
- Unauthorized trades
- Account access problems

For these, DM us immediately on X with "URGENT" in the message.

**Feature Requests:**
Have an idea for improvement? Same process - reach out on X! We love hearing user feedback.`,
  },
  {
    id: 'mobile-app',
    category: 'Technical & General',
    question: 'Do you have a mobile app?',
    answer: `**Not yet, but Polycopy works great on mobile browsers!**

Our web app is fully responsive and optimized for mobile devices. You can access all features on your phone or tablet:

- Browse and discover traders
- View your personalized feed
- Execute Quick Copy trades (premium)
- Manual copy trades
- Track your performance
- Manage your account and subscription

**Best Mobile Experience:**
1. Open [polycopy.app](https://polycopy.app) in your mobile browser (Safari, Chrome, etc.)
2. Tap the "Share" button (iOS) or menu (Android)
3. Select "Add to Home Screen"
4. Now Polycopy opens like a native app!

**Native apps coming soon!** We're working on dedicated iOS and Android apps for an even better experience. Premium subscribers will get early access when they launch.`,
  },
  {
    id: 'how-make-money',
    category: 'Technical & General',
    question: 'How does Polycopy make money?',
    answer: `We believe in complete transparency about our business model. Here's exactly how Polycopy makes money:

**Premium Subscriptions - $20/month**
Our only revenue source. We charge a flat monthly fee for premium features like Quick Copy, auto-close positions, and advanced trade controls. That's it. Simple.

**What we DON'T charge:**
- No per-trade fees - Trade as much as you want on Premium
- No profit sharing - You keep 100% of your trading profits
- No commission on wins - Your success doesn't cost you extra
- No hidden fees - $20/month is all you pay
- No affiliate kickbacks from traders - We don't get paid when you follow certain traders

**Why this matters:**
Our incentives align with yours. We succeed when you find value in the platform, not when you trade more or lose money. We want you to become a successful copy trader, not a frequent trader paying us fees on every transaction.

**Other costs to consider:** Polymarket itself may charge minimal fees on trades (typically ~2% on wins). These go to Polymarket, not Polycopy. There are no gas fees since Polymarket uses a gasless trading system.`,
  },
];
