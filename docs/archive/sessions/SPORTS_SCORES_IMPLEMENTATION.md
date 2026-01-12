# Sports Scores & Game Times Implementation

## ✅ What's Implemented

### For Sports Markets on Feed Cards:

1. **Live Scores** (if available from Polymarket)
   - Shows actual score: `Chiefs 21 - 14 Raiders`
   - Real-time updates when score data is available

2. **Game Status Indicators**
   - `🏁 Final` - Game has finished
   - `🔴 LIVE` - Game is currently in progress
   - `🗓️ Jan 5, 7:30 PM` - Game start time for upcoming games

3. **Fallback**
   - Shows odds if no game data is available
   - Example: `Chiefs: 62% | Raiders: 38%`

### For Non-Sports Markets:
- Continues showing odds as before
- Example: `Yes: 52% | No: 48%`

---

## 🔧 Technical Implementation

### Files Modified:

1. **`/app/api/polymarket/price/route.ts`**
   - Enhanced to return sports metadata from CLOB API:
     - `gameStartTime` - ISO 8601 timestamp
     - `eventStatus` - Current status (live, finished, etc.)
     - `score` - Live score object (`{ home: number, away: number }`)
     - `homeTeam` / `awayTeam` - Team names
     - `closed` - Whether market is closed

2. **`/app/feed/page.tsx`**
   - Updated `liveMarketData` state to include sports metadata
   - Enhanced `fetchLiveMarketData()` function with sports-aware logic:
     - Detects sports markets (vs., @, sports category)
     - Prioritizes score display over odds
     - Handles different game states (upcoming, live, finished)
     - Formats game start times in user-friendly format

---

## 📊 Display Logic (Sports Markets)

```javascript
if (liveScore exists) {
  // Show actual score
  Display: "Chiefs 21 - 14 Raiders"
}
else if (closed || eventStatus === 'finished') {
  // Game finished
  Display: "🏁 Final"
}
else if (eventStatus === 'live' || 'in_progress') {
  // Game in progress
  Display: "🔴 LIVE"
}
else if (gameStartTime in future) {
  // Game hasn't started
  Display: "🗓️ Jan 5, 7:30 PM"
}
else if (gameStartTime in past) {
  // Probably live
  Display: "🔴 LIVE"
}
else {
  // No data, fallback to odds
  Display: "Chiefs: 62% | Raiders: 38%"
}
```

---

## 🚀 Future Enhancements

### Option 1: Real-Time Data Socket (RTDS)
For truly live updates without polling:

```javascript
// Connect to Polymarket RTDS
const ws = new WebSocket('wss://ws-live-data.polymarket.com');

// Subscribe to sports events
ws.send(JSON.stringify({
  action: 'subscribe',
  subscriptions: [{
    topic: 'sports_events',
    type: 'update',
    filters: `event_id:${marketId}`
  }]
}));

// Handle real-time updates
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.payload.score) {
    // Update score in real-time
    updateMarketScore(data.payload.score);
  }
};
```

### Option 2: Third-Party Sports API
If Polymarket doesn't provide scores, integrate with:
- ESPN API
- The Odds API
- SportsData.io
- RapidAPI Sports

### Option 3: Polling Interval
- Currently: Fetches on page load and manual refresh
- Enhancement: Auto-refresh every 30-60 seconds for live games
- Only poll markets that are currently live (optimize API calls)

---

## 🧪 Testing

### Test Cases:

1. **Upcoming game**: Should show formatted start time
2. **Live game with score**: Should show actual score
3. **Live game without score**: Should show "🔴 LIVE"
4. **Finished game**: Should show "🏁 Final"
5. **Non-sports market**: Should show odds percentages

### How to Test Locally:

1. Start dev server: `npm run dev`
2. Navigate to `/feed`
3. Look at sports trades (Chiefs vs. Raiders, etc.)
4. Check console logs for fetched data
5. Verify correct display based on game status

---

## 📝 Notes

- Currently relies on Polymarket CLOB API providing sports metadata
- Some older markets may not have `gameStartTime` or `score` fields
- Falls back gracefully to odds display when data is unavailable
- Future: Consider implementing RTDS WebSocket for instant updates
- Scores update on page load/refresh (not real-time yet)

---

## 🐛 Known Limitations

1. **No real-time updates** - Requires manual refresh or page reload
2. **Score availability** - Depends on Polymarket providing score data
3. **Historical games** - Old markets may not have metadata
4. **Timezone handling** - Game times shown in user's local timezone

---

## 💡 Recommendations

For production:
1. Test with various sports markets to confirm data availability
2. Consider adding RTDS WebSocket for live games
3. Implement auto-refresh for markets with `eventStatus: 'live'`
4. Add loading states for score updates
5. Cache game times to reduce API calls

