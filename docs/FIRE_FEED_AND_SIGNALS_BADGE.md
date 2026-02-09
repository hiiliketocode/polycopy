# Fire Feed & Signals/Recommendation Badge

## Old vs new badge (trade cards, admins only)

### Old: “Gemini verdict”
- **What it was:** A button at the bottom of the card (“Gemini verdict”) that opened a panel.
- **Behavior:** On click, it called Gemini with trade context and showed a free-form verdict (recommendation, bet size, headline, rationale).
- **Data:** Live Gemini API call at click time; no precomputed score.
- **Where it is:** Still in the trade card: same button + expandable “Gemini Trade Verdict” panel (admin-only). It was never removed.

### New: PolySignal badge
- **What it is:** A compact badge near the **top** of the card (under the trader name): score circle (0–100) + recommendation label (e.g. “Strong Buy”, “Buy”, “Neutral”, “Avoid”, “Toxic”) + optional headline. Expandable for score breakdown and trader insights.
- **Behavior:** Shows a structured signal; no Gemini call. Can use server data only (fire feed) or client-fetched PolyScore.
- **Data:**
  - **Fire feed (admin):** Score and recommendation come from the **fire-feed API** (`/api/fire-feed`). The API computes PolySignal per trade and attaches `_polySignalScore` and `_polySignalRecommendation`; the feed passes these as `polySignalScore` / `polySignalRecommendation` to the card. The badge renders from this “server-only” path when there is no client PolyScore yet.
  - **Client PolyScore (optional):** The card can also call the PolyScore API (condition + wallet) to get full analysis; then the badge uses that data and can overlay price-movement overrides on the server recommendation.
- **Scoring (same on server and client):** Edge (50%) + Conviction (25%) + Skill (15%) + Context (10%) → 0–100 score; then STRONG_BUY (≥75), BUY (≥60), NEUTRAL (≥45), AVOID (≥30), TOXIC (&lt;30), plus hard overrides (e.g. hedging + negative edge → TOXIC).

## Fire feed: how it works (after redo)

- **Purpose:** Show only trades that **qualify under the new (PolySignal) scoring system**, from **any trader** (not limited to followed or leaderboard-only).
- **Data source:** Recent trades from the **global Polymarket trades API** (`https://data-api.polymarket.com/trades?limit=...&offset=...` with **no** `user` filter), so trades from any wallet.
- **Filter:** For each trade we compute PolySignal (same formula as above). We **only return** trades with recommendation **BUY** or **STRONG_BUY**. NEUTRAL/AVOID/TOXIC are dropped.
- **Stats for scoring:** We collect unique wallets from the fetched trades, then batch-fetch `trader_global_stats` and `trader_profile_stats` from Supabase for those wallets. Wallets without stats are scored with conservative defaults (so they rarely pass).
- **Trader names:** Built from a leaderboard fetch (e.g. top 500 by PNL); wallets not on that leaderboard show as truncated address.
