# Badge Logic Breakdown

## Markets Table Columns Used

The following columns from the `markets` table are used for badge logic:

1. **`condition_id`** (TEXT, PRIMARY KEY) - Always used to look up markets
2. **`title`** - Market title (used for display only, NOT for sports detection or time parsing)
3. **`tags`** (JSONB) - Market tags (used to detect sports markets - but game_start_time is primary indicator)
4. **`game_start_time`** (TIMESTAMPTZ) - **ONLY** source for game start time (no fallbacks)
5. **`end_time`** (TIMESTAMPTZ) - Market end time (used for non-sports "Resolves" badge)
6. **`completed_time`** (TIMESTAMPTZ) - When the game/market completed (used to determine if game is live)
7. **`status`** (TEXT) - Market status (used for live/ended detection)
8. **`close_time`** (TIMESTAMPTZ) - Market close time (alternative end time source)

**Important:** We do NOT use:
- `start_time` (not used as fallback)
- Title parsing for time (not used)
- Gamma API `gameStartTime` (not used)
- Event `startTime` (not used)

## Badge State Types

The system uses these badge state types:
- `scheduled` - Game/market hasn't started yet
- `live` - Game/market is currently active
- `ended` - Game has finished
- `resolved` - Market has been resolved
- `none` - No badge should be shown

## Category Types

Markets are classified into three categories:

1. **`SPORTS_SCOREABLE`** - Sports games with scores (e.g., "Team A vs Team B")
2. **`SPORTS_NON_SCOREABLE`** - Sports futures/long-term markets (e.g., "Team to win championship")
3. **`NON_SPORTS`** - All non-sports markets (crypto, politics, etc.)

## Badge Rules

### Step 1: Market Category Detection

**Rule:** A market is classified as sports if it has `game_start_time`:
- If `game_start_time` exists → it's a sports game
- If `game_start_time` is NULL → it's non-sports

**Note:** Tags are NOT required for sports detection. `game_start_time` is the primary and only indicator.

**Sports Tokens Detected:**
- League names: nfl, nba, mlb, nhl, ncaa, ncaab, ncaaf, ncaaw, soccer, mls, etc.
- Sport names: basketball, football, baseball, hockey, tennis, golf, etc.
- Scoreable signals: "vs", "vs.", "v", "@", "at", "o/u", "over/under", "spread", "moneyline"

**If NOT sports:** → `NON_SPORTS`
**If sports:** Continue to Step 2

### Step 2: Scoreable vs Non-Scoreable

**Rule:** Sports markets are further classified:

**Scoreable signals:**
- Title contains: "vs", "vs.", "v", "@", "at", "o/u", "over/under", "spread", "moneyline"
- Title contains: "fc", "sc", "cf", "afc", "club" (soccer indicators)
- Title contains score pattern: `\d+-\d+` (e.g., "21-14")
- Has `game_start_time`

**Futures indicators (makes it NON_SCOREABLE):**
- Title contains: "to win", "winner", "championship", "futures", "mvp", etc.
- More than 2 outcomes
- Season-long market titles

**Result:**
- If futures OR no scoreable signals → `SPORTS_NON_SCOREABLE`
- Otherwise → `SPORTS_SCOREABLE`

### Step 3: Time Selection

**Rule:** Which time to display depends on market type:

1. **Sports market WITH `game_start_time`:**
   - Use `game_start_time` **ONLY** (no fallbacks)
   - **Badge prefix:** "Starts"

2. **Non-sports OR sports WITHOUT `game_start_time`:**
   - Use `end_time` **ONLY** (no fallbacks)
   - **Badge prefix:** "Resolves"

### Step 4: Badge State Determination

**For NON_SPORTS markets:**
- If `status` indicates resolved OR `gammaResolved` = true → `resolved`
- Otherwise → `scheduled`
- **Time shown:** End time (if available)

**For SPORTS_NON_SCOREABLE markets:**
- Always → `scheduled`
- **Time shown:** Start time (if available)

**For SPORTS_SCOREABLE markets:**
- **Live detection:**
  - Market is `SPORTS_SCOREABLE` AND
  - Has `game_start_time` AND
  - Current time >= start time AND
  - `completed_time` is NULL/empty
  - OR `websocketLive` = true
  - → `live`
  
- **Ended detection:**
  - `status` indicates final/resolved OR
  - `gammaResolved` = true OR
  - `websocketEnded` = true
  - → `ended`
  
- **Otherwise:**
  - → `scheduled`

### Step 5: Badge Display Rules

**Time Badge:**
- Show if: `badgeType !== "none"` AND time is available AND `badgeType !== "live"`
- Format: "Starts Today, 4:00 PM" or "Resolves Jan 25, 10:30 PM"
- Uses user's local timezone for display

**Status Badge:**
- Show if: `badgeType === "live"` OR `badgeType === "ended"` OR `badgeType === "resolved"`
- Shows: "Live" (with score if available), "Ended", or "Resolved"
- **Important:** If status badge is "Live", time badge is hidden

**Score Display:**
- Only shown for `live` or `ended` states
- Priority: websocket > espn > gamma
- Format: "Home Score - Away Score" (e.g., "21 - 14")

## Priority System

**Time Source Priority:**
- **For sports markets:** `game_start_time` from markets table (ONLY)
- **For non-sports markets:** `end_time` from markets table (ONLY)
- **No fallbacks** to title parsing, `start_time`, Gamma API, or event data

**Source Priority (for badge state):**
1. `websocket` (highest reliability)
2. `espn` (sports scores)
3. `gamma` (Polymarket API)
4. `none` (lowest)

## State Transition Rules

**Illegal Downgrades Prevented:**
- Cannot go from `live` → `scheduled`
- Cannot go from `ended` → `live` or `scheduled`
- Previous state is preserved if downgrade attempted

**Upgrades Allowed:**
- `scheduled` → `live` ✓
- `scheduled` → `ended` ✓
- `live` → `ended` ✓

## Examples

### Example 1: NFL Game
- **Title:** "Chiefs vs Raiders"
- **Tags:** ["nfl", "football"]
- **game_start_time:** "2024-01-25T20:00:00Z"
- **completed_time:** NULL
- **Result:** 
  - Category: `SPORTS_SCOREABLE`
  - Badge: "Starts Today, 8:00 PM" (before game) or "Live 21 - 14" (during game)

### Example 2: Crypto Market
- **Title:** "Ethereum Up or Down"
- **Tags:** []
- **game_start_time:** NULL
- **end_time:** "2024-01-25T22:00:00Z"
- **Result:**
  - Category: `NON_SPORTS`
  - Badge: "Resolves Today, 10:30 PM" (converted to user's timezone)

### Example 3: Sports Futures
- **Title:** "Lakers to win NBA Championship"
- **Tags:** ["nba", "basketball"]
- **game_start_time:** NULL
- **Result:**
  - Category: `SPORTS_NON_SCOREABLE`
  - Badge: "Resolves [end_time]" (no start time, so uses end time)

## Market Data Flow

1. **Feed/API Request** → Always has `condition_id`
2. **`/api/polymarket/price`** → Calls `ensureCachedMarket()`
3. **`ensureCachedMarket()`** → 
   - Looks up by `condition_id` in markets table
   - If not found, fetches from Dome API
   - Upserts to markets table
   - Returns market data
4. **Badge Logic** → Uses `game_start_time` from markets table (ONLY)

## Key Files

- **`lib/badge-state.ts`** - Core badge logic
- **`components/polycopy/trade-card.tsx`** - Badge display logic
- **`app/api/polymarket/price/route.ts`** - Fetches market data from database, syncs from Dome API
- **`lib/markets/dome.ts`** - Maps Dome API response to markets table schema
- **`app/feed/page.tsx`** - Calls badge logic for feed trades
