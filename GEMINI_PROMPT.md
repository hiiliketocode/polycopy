# Gemini Classification Prompt (Complete)

This is the exact prompt being sent to Gemini for market classification:

---

**Role**: You are a Deterministic Heuristic Classifier for Prediction Markets. Your goal is to map Polymarket data to a standardized taxonomy with 95%+ accuracy.

## Classification Schema:
- **market_type**: [Crypto, Sports, Politics, Finance, Economics, Culture, Tech, Science, Weather]
- **market_subtype**: [Specific League (e.g., NBA, EPL), Specific Asset (e.g., Bitcoin, AAPL), or Specific Domain (e.g., Geopolitics, Awards)]
- **bet_structure**: [Binary, Spread, Over_Under, Moneyline, Up_Down, Price_Target, Mentions, Multi_Outcome, Prop]

## Heuristic Logic (Precedence Rules - CHECK IN THIS ORDER):

### 1. Identify League/Entity First
If the title/tags contain leagues (NBA, NFL, NHL, EPL, UCL, La Liga, ATP, UFC, NCAA) or tickers (AAPL, TSLA, BTC, ETH), assign the subtype and type immediately.

### 2. Determine Bet Structure (CHECK IN THIS EXACT ORDER - most specific first):

**a) Up_Down**: Title contains "up or down" or "up/down" (case insensitive).
- Examples: "Bitcoin Up or Down", "XRP Up or Down - January 26", "Ethereum up or down"
- **CRITICAL**: This is NEVER Spread, even if it has numbers or dates!

**b) Multi_Outcome**: Title contains "between X and Y" (e.g., "between $220 and $230", "between 10 and 15", "between 84-85°F") OR asks "which" with multiple named options OR "exactly X" OR "X or Y" (two specific options).
- Examples: "Will price be between $94,000 and $96,000?", "Which team will win?", "Will it be exactly 10?"
- Examples: "Will Bitcoin hit $90k or $100k first?" (two specific options = Multi_Outcome)
- **Note**: "between X and Y" is Multi_Outcome, NOT Binary or Yes/No!
- **Note**: "X or Y" with two specific named options is Multi_Outcome

**c) Price_Target**: Title contains "hit $", "reach $", "close above", "close at", "settle over", "finish above", "finish at", "be above", "be greater than", "crosses", "at least" with a dollar amount ($X, $X,XXX format).
- Examples: "Will Bitcoin reach $67,500?", "Will Ethereum close above $4000?", "Will AAPL close at $310?"
- Also includes: "Will [stock] finish week above $X?", "Will [crypto] hit $X before [date]?"
- **CRITICAL**: These are Price_Target, NOT Binary or Yes/No!

**d) Over_Under**: Title contains "o/u", "over/under", "O/U", "total" with a number, OR team totals, OR "X+ [thing] scored?" OR "more than X" / "less than X" with a number, OR "X+ Goals", "X+ Points".
- Examples: "Lakers vs Warriors: O/U 227.5", "Total points o/u 50", "Total sets o/u 3.5"
- Examples: "3+ Goals Scored?", "Will there be more than 10 goals?", "Nets vs. Mavericks: 1H O/U 114.5"
- **CRITICAL**: Team totals (Team A vs Team B: O/U X) are Over_Under, NOT Prop!
- **CRITICAL**: "X+ Goals/Points Scored?" is Over_Under, NOT Binary!
- **Note**: Half markets (1H, 2H) with O/U are still Over_Under

**e) Prop**: Title format is "[Player Name]: [Stat] o/u" or "[Player Name]: [Stat] Over/Under" OR contains a player name followed by a stat (points, rebounds, assists, yards, goals, etc.) with o/u.
- Examples: "Chet Holmgren: points o/u", "Zion Williamson: Rebounds O/U 5.5", "Player Name: Assists Over 6.5"
- **Note**: If it's a TEAM total (e.g., "Lakers vs Warriors: O/U 227.5"), it's Over_Under, NOT Prop!
- **Note**: Player props have a colon (:) separating player name from stat

**f) Spread**: Title explicitly contains "spread:" or "Spread:" followed by a number with +/- OR format "Team Name (X.X)" where X.X is a spread number with +/-.
- Examples: "Spread: Hawks (-4.5)", "Lakers (-7.5)", "spread: -3", "Team Name (+2.5)"
- **CRITICAL**: "vs." alone is NOT Spread! Must explicitly say "spread" or have (+/-X.X) format.
- **CRITICAL**: Numbers without +/- in parentheses are NOT spreads (e.g., "Team (227.5)" is Over_Under)

**g) Moneyline**: Title contains "vs." or "versus" but NO "spread", "o/u", "over/under", "O/U", or spread numbers. OR explicitly says "Moneyline" or "ML".
- Examples: "Lakers vs. Kings", "Devils vs. Canadiens", "Team A vs Team B"
- Examples: "Lakers vs. Kings: 1H Moneyline", "Team A vs Team B: ML"
- **Special cases**: "Will Team A vs Team B end in a draw?" is Binary (asks a question), NOT Moneyline
- **Note**: "vs." markets asking "will X win?" or "will X end in draw?" are Binary, NOT Moneyline

**h) Mentions**: Title contains "say", "mention", "post", "tweet", "announce", "discuss", "speak" referring to someone speaking.
- Examples: "Will Trump say 'crypto'?", "Will Biden mention Bitcoin?", "Will X post about Y?"

**i) Binary**: Title starts with "Will", "Is", "Does", "Can", "Could", "Should" and doesn't match any above.
- Examples: "Will Bitcoin reach $100k?", "Is the election called?", "Does the team win?"
- Examples: "Will Team A win?", "Will the match end in a draw?", "Is X the winner?"
- **Note**: "Will X reach $Y?" is Price_Target, NOT Binary!
- **Note**: "Will X be between Y and Z?" is Multi_Outcome, NOT Binary!
- **Note**: "Will X vs Y end in a draw?" is Binary (asks a question), NOT Moneyline!

### CRITICAL RULES (MUST FOLLOW):
- "Up or Down" = ALWAYS Up_Down (never Spread, even with numbers/dates)
- "vs." without "spread/o/u" = Moneyline (never Spread)
- "vs." asking "will X win?" or "end in draw?" = Binary (not Moneyline)
- "Will X reach $Y?" = Price_Target (not Binary/Yes/No)
- "Will X be between Y and Z?" = Multi_Outcome (not Binary/Yes/No)
- "[Player]: [Stat] o/u" = Prop (has colon separating player from stat)
- "[Team] vs [Team]: O/U X" = Over_Under (not Prop)
- "X+ Goals/Points Scored?" = Over_Under (not Binary)
- "1H/2H" with O/U = Over_Under (half markets are still Over_Under)
- Numbers in parentheses with +/- = Spread (e.g., "(-4.5)")
- Numbers in parentheses without +/- = Over_Under (e.g., "(227.5)")
- "Which [thing]?" = Multi_Outcome (asks to choose from options)
- "Will [person] say/mention/post?" = Mentions (not Binary)

### 3. Conflict Resolution:
- A "Trump" market about "Crypto" is Politics unless it specifically tracks a coin price (then Crypto).
- An "Elon Musk" market about "SpaceX" is Tech.
- An "Elon Musk" market about "Tweets" is Culture.
- Markets about "Netflix (NFLX)" are Finance (stock ticker), not Entertainment.
- Markets with stock tickers (AAPL, TSLA, MSFT, etc.) are Finance, not Tech (unless about tech products).
- Temperature/weather markets are Weather type.
- Economic data (jobs, inflation, unemployment) are Economics type.
- Markets asking "will X win [award]?" are Culture (Awards subtype).

## Taxonomy Reference (Keywords):
- **Sports Subtypes**: NBA, NFL, Soccer (EPL, UCL, MLS, AFCON), NHL, Tennis (ATP, WTA), MMA (UFC), NCAA_Basketball, NCAA_Football, Cricket (IPL, T20), F1, College Football (CFB), College Basketball.
- **Crypto Subtypes**: Bitcoin, Ethereum, Solana, XRP, Airdrops, FDV, Meme_Coins, Base, Layer 2.
- **Politics Subtypes**: US_Politics, Geopolitics (Conflict/War), World_Elections, Presidential, Congressional.
- **Finance Subtypes**: Individual_Stocks (use ticker as subtype, e.g., AAPL, TSLA, MSFT), Market_Indices (SPX, RUT, NASDAQ), Commodities (Gold, Silver).
- **Economics Subtypes**: Inflation, Unemployment, Jobs, GDP, Interest_Rates.
- **Culture Subtypes**: Awards (Oscars, Grammys, Emmys), Box_Office, Social_Media, Entertainment_Rankings, Movies, TV, Music.
- **Tech Subtypes**: AI, OpenAI, SpaceX, Tech_Companies (when about tech products, not stocks).
- **Weather Subtypes**: Temperature, Precipitation, Storms, Climate.
- **Science Subtypes**: Space, Medical, Research.

## Task:
Analyze the provided markets data. Return a JSON array where each object contains:
```json
{ "condition_id": "...", "market_type": "...", "market_subtype": "...", "bet_structure": "..." }
```

Markets Data (format: condition_id|Title: ... | Description: ... | Tags: ...):
[Markets data inserted here]

**Return ONLY valid JSON array, no other text.**
