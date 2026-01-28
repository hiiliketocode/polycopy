# Building Heuristics Model from Gemini Classifications

## Overview
Once Gemini has classified all markets, we'll analyze those classifications to extract patterns and build a deterministic heuristics model.

## Process

### Step 1: Data Collection
- **Input**: `gemini-classifications.json` (all Gemini classifications)
- **Input**: `markets_data.json` (market titles, descriptions, tags)
- **Output**: `combined_heuristics_model.json` (deterministic rules)

### Step 2: Pattern Extraction

For each classification category, we'll:

1. **Group by Classification**
   - Group all markets by `market_type`
   - Group by `market_subtype` (within each type)
   - Group by `bet_structure`

2. **Extract Keywords**
   - For each group, extract all keywords from:
     - Market titles
     - Descriptions
     - Tags
   - Count keyword frequency within each group

3. **Calculate Significance**
   - Keywords that appear in 80%+ of a category = high confidence
   - Keywords that appear in 50-80% = medium confidence
   - Keywords that appear in 20-50% = low confidence (but still useful)
   - Keywords that appear in <20% = likely noise

4. **Build Rules**
   - **Market Type Rules**: Top keywords for each market type
   - **Subtype Mappings**: Keywords → subtype mappings (e.g., "nba" → "NBA")
   - **Bet Structure Rules**: Pattern matching rules (regex, contains, starts_with, etc.)

### Step 3: Rule Generation

#### Market Type Rules
```json
{
  "Sports": ["nba", "nfl", "basketball", "football", ...],
  "Crypto": ["bitcoin", "btc", "ethereum", "crypto", ...],
  "Politics": ["election", "trump", "biden", "presidential", ...]
}
```

#### Subtype Keywords
```json
{
  "Sports": {
    "nba": "NBA",
    "nfl": "NFL",
    "tennis": "Tennis"
  },
  "Crypto": {
    "btc": "Bitcoin",
    "bitcoin": "Bitcoin",
    "eth": "Ethereum"
  }
}
```

#### Bet Structure Rules
```json
{
  "Binary": {
    "starts_with": ["will", "is", "does"],
    "contains": ["yes/no"]
  },
  "Over_Under": {
    "contains": ["over", "under", "o/u", "total"]
  },
  "Up_Down": {
    "contains": ["up or down", "up/down"]
  }
}
```

### Step 4: Validation

After building the model, we'll:
1. Test it on a sample of Gemini-classified markets
2. Calculate accuracy: % matching Gemini classifications
3. Identify common errors
4. Refine rules based on errors

### Step 5: Refinement

- Add edge case rules
- Adjust keyword thresholds
- Add conflict resolution rules
- Update precedence order

## Example Analysis

If Gemini classified 1000 "Sports" markets:
- 950 contain "nba" or "nfl" or "basketball" → high confidence keywords
- 800 contain "game" or "match" → medium confidence
- 200 contain "player" → might be prop bets, not just sports type

We'd extract:
- "nba", "nfl", "basketball" as primary Sports keywords
- "game", "match" as secondary keywords
- Handle "player" separately (might indicate Prop bet structure)

## Usage

```bash
# After Gemini classification completes
node scripts/build-heuristics-from-gemini.js

# Validate the model
node scripts/validate-heuristics.js

# Use for new markets (no API calls needed)
node scripts/backfill-market-heuristics.js
```

## Expected Output

The heuristics model will be a JSON file with:
- Keyword lists for each market type
- Subtype mappings
- Bet structure pattern rules
- Precedence/conflict resolution logic

This model can then classify new markets instantly without API calls!
