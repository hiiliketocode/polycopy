# ESPN Live Scores Integration ✅

## Overview
Polycopy now displays **real live scores** for sports markets using ESPN's free API!

---

## ✨ Features

### For Sports Markets (NFL, NBA, MLB, NHL):

1. **📊 Live Scores**
   - Shows actual score during games: `🔴 21-14 (Q3 2:45)`
   - Updates include quarter/period and game clock

2. **🏁 Final Scores**
   - Shows final score when game ends: `🏁 Final: 27-20`

3. **🗓️ Upcoming Games**
   - Shows game start time: `🗓️ Jan 4, 8:15 PM`

4. **Graceful Fallback**
   - Falls back to Polymarket data if ESPN doesn't have the game
   - Shows odds if no sports data available

---

## 🏗️ Architecture

### New Files:

1. **`/app/api/espn/scores/route.ts`**
   - Proxy endpoint for ESPN API (bypasses CORS)
   - Fetches live scores for NFL, NBA, MLB, NHL
   - Usage: `/api/espn/scores?sport=nfl&teams=chiefs,raiders`

2. **`/lib/espn/scores.ts`**
   - Helper functions for matching ESPN games to Polymarket markets
   - Smart team name matching (handles abbreviations, partial matches)
   - Sport detection based on team names
   - Batch fetching for efficiency

### Modified Files:

3. **`/app/feed/page.tsx`**
   - Integrated ESPN score fetching
   - Prioritizes ESPN data over Polymarket data
   - Enhanced display logic for scores

---

## 🎯 How It Works

### 1. Sport Detection
```typescript
// Automatically detects sport from team names in market title
"Chiefs vs. Raiders" → NFL
"Lakers vs. Celtics" → NBA
"Yankees vs. Red Sox" → MLB
```

### 2. Team Matching
```typescript
// Flexible matching handles various formats:
✅ "Chiefs" matches "Kansas City Chiefs"
✅ "KC" matches "Kansas City Chiefs"
✅ "Kansas City" matches "Kansas City Chiefs"
```

### 3. Score Display Priority
```
1. ESPN live score (if available) 🎯
   ↓
2. Polymarket score data (if available)
   ↓
3. Game status indicators (LIVE, Final)
   ↓
4. Game start time (for upcoming)
   ↓
5. Odds (fallback)
```

---

## 📡 ESPN API Details

### Endpoints Used:
- **NFL**: `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard`
- **NBA**: `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard`
- **MLB**: `https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard`
- **NHL**: `https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard`
- **WNBA + College (NCAAF/NCAAB/NCAAW)**: see `app/api/espn/scores/route.ts`
- **Soccer (MLS, EPL, La Liga, Serie A, Bundesliga, Ligue 1, UEFA, World Cup)**: see `app/api/espn/scores/route.ts`
- **Tennis, golf, UFC, boxing**: see `app/api/espn/scores/route.ts`

### Rate Limits:
- ✅ **No API key required**
- ✅ **No documented rate limits**
- ✅ **Completely free**
- ⚠️ Unofficial API (could change without notice)

---

## 🧩 Secondary Provider (The Odds API)

- **Optional fallback** when ESPN misses or is unavailable
- **Env var**: `THE_ODDS_API_KEY`
- **Endpoint**: `https://api.the-odds-api.com/v4/sports/{sport}/scores/`
- **Behavior**: used only after ESPN fails to match; Polymarket data remains the last fallback

---

## 🧪 Testing

### Test Cases:

**1. Upcoming Game**
- Market: "Chiefs vs. Raiders"
- Expected: `🗓️ Jan 4, 8:15 PM`

**2. Live Game**
- Market: "Lakers vs. Celtics"
- Expected: `🔴 98-92 (Q4 5:23)`

**3. Final Game**
- Market: "Yankees vs. Red Sox"
- Expected: `🏁 Final: 5-3`

**4. Non-Sports Market**
- Market: "Will Bitcoin hit $100k?"
- Expected: `Yes: 52% | No: 48%` (odds)

### How to Test Locally:

1. Start dev server: `npm run dev`
2. Navigate to `/feed`
3. Look for sports trades
4. Check console logs to see ESPN data fetching
5. Verify scores match ESPN.com

---

## 🔍 Console Logs

When fetching scores, you'll see:
```
📊 Fetching live data for 15 markets
🏈 Fetching ESPN scores for sports markets...
🔍 Detected NFL for: Chiefs vs. Raiders
🏈 Looking for: Chiefs vs Raiders
✅ Found ESPN game: Kansas City Chiefs at Las Vegas Raiders | Status: live
🔴 ESPN Live score: 21-14 (Q3 2:45)
✅ Got ESPN scores for 3 markets
```

---

## 📊 Supported Teams

### NFL (32 teams)
Chiefs, Raiders, Chargers, Broncos, Cowboys, Giants, Eagles, Commanders, Bears, Lions, Packers, Vikings, Falcons, Panthers, Saints, Buccaneers, Cardinals, Rams, Seahawks, 49ers, Bills, Dolphins, Patriots, Jets, Ravens, Bengals, Browns, Steelers, Texans, Colts, Jaguars, Titans

### NBA (30 teams)
Lakers, Clippers, Warriors, Kings, Suns, Mavericks, Rockets, Spurs, Nuggets, Jazz, Thunder, Timberwolves, Trail Blazers, Grizzlies, Pelicans, Heat, Magic, Hawks, Hornets, Wizards, Celtics, Nets, 76ers, Knicks, Raptors, Bucks, Bulls, Cavaliers, Pistons, Pacers

### MLB (30 teams)
Yankees, Red Sox, Dodgers, Giants, Cubs, Cardinals, Astros, Braves, Mets, Phillies, Padres, Mariners, Rangers, Angels, Athletics, Rays, Tigers, Twins, Guardians, Royals, White Sox, Marlins, Nationals, Orioles, Blue Jays, Diamondbacks, Rockies, Pirates, Reds, Brewers

### NHL (32 teams)
Bruins, Canadiens, Maple Leafs, Senators, Penguins, Flyers, Rangers, Islanders, Devils, Blackhawks, Red Wings, Predators, Blues, Wild, Avalanche, Stars, Jets, Oilers, Flames, Canucks, Golden Knights, Kraken, Ducks, Sharks, Kings, Hurricanes, Panthers, Lightning, Capitals, Blue Jackets, Sabres, Coyotes

---

## 🚀 Future Enhancements

### 1. Auto-Refresh for Live Games
```typescript
// Refresh scores every 30 seconds for live games
useEffect(() => {
  const liveGames = trades.filter(t => liveMarketData.get(t.market.conditionId)?.status === 'live');
  if (liveGames.length > 0) {
    const interval = setInterval(() => {
      fetchLiveMarketData(liveGames);
    }, 30000);
    return () => clearInterval(interval);
  }
}, [liveMarketData]);
```

### 2. Add More Sports
- College Football (NCAAF)
- College Basketball (NCAAB)
- MMA/UFC
- Tennis
- Golf

### 3. Score Animations
- Pulse effect when score changes
- Sound notification for score updates
- Highlight recent score changes

### 4. Historical Scores
- Cache final scores in database
- Show score history for resolved markets

---

## ⚠️ Known Limitations

1. **ESPN API Availability**
   - Unofficial API (no SLA)
   - Could change format or become unavailable
   - Consider API-Sports.io as backup (100 requests/day free)

2. **Team Name Matching**
   - May miss some edge cases
   - Relies on common team name patterns
   - Can be improved with more aliases

3. **Not Real-Time**
   - Fetches on page load/refresh
   - No WebSocket for instant updates
   - Good enough for 95% of use cases

4. **International Sports**
   - Currently focuses on US sports
   - Soccer (Premier League, La Liga, etc.) available via ESPN but not implemented yet

---

## 💡 Recommendations

1. **Monitor ESPN API**: Watch for any changes in API structure
2. **Add Backup API**: Implement API-Sports.io as fallback if ESPN fails
3. **Cache Scores**: Store scores in memory to reduce API calls
4. **User Feedback**: Add visual indicator when scores are live (pulsing dot)
5. **Error Handling**: Show "Score unavailable" gracefully if both APIs fail

---

## 📚 Resources

- ESPN API (Unofficial): https://gist.github.com/akeaswaran/b48b02f1c94f873c6655e7129910fc3b
- API-Sports (Official): https://api-sports.io
- The Odds API: https://the-odds-api.com
- SportSRC: https://sportsrc.org

---

**Status**: ✅ **Production Ready**

The ESPN integration is working and ready for production. It enhances the user experience significantly by showing actual live scores instead of just odds percentages for sports markets!
