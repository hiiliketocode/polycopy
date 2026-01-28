# Gemini Market Classification & Heuristics Model Plan

## Overview
Use Google Gemini API to classify 50k+ markets, then build a deterministic heuristics model from the results to avoid API costs for future automated classifications.

## Architecture

### Phase 1: Gemini API Backfill (One-time)
**Goal**: Classify all existing markets using Gemini API

**Steps**:
1. **Export Markets Data**
   - Export `condition_id`, `title`, `description`, `tags` from markets table
   - Format as CSV or JSON for batch processing
   - Estimate: 50k+ markets

2. **Gemini API Integration**
   - Use `@google/generative-ai` package (need to install)
   - Model: `gemini-1.5-flash` (lowest cost, fast)
   - Batch size: 50-100 markets per API call (Gemini supports large context)
   - Rate limiting: Respect API quotas (60 requests/min free tier)

3. **Classification Prompt**
   - Use the provided deterministic classifier role/system prompt
   - Request JSON output format: `{condition_id, market_type, market_subtype, bet_structure}`
   - Include examples in prompt for consistency

4. **Storage**
   - Store Gemini classifications in database (update markets table)
   - Also save raw responses to JSON file for analysis
   - Track confidence/uncertainty if possible

**Cost Estimate**:
- Gemini 1.5 Flash: ~$0.075 per 1M input tokens, ~$0.30 per 1M output tokens
- Per market: ~200 tokens input, ~50 tokens output = ~$0.00002 per market
- 50k markets: ~$1-2 total cost

### Phase 2: Heuristics Model Building
**Goal**: Extract patterns from Gemini classifications to build deterministic rules

**Steps**:
1. **Pattern Analysis**
   - Load Gemini classifications from database
   - Group by `market_type`, `market_subtype`, `bet_structure`
   - Extract common keywords/phrases for each classification
   - Identify edge cases and conflicts

2. **Rule Extraction**
   - For each market_type: Extract keywords that appear in 80%+ of that type
   - For each market_subtype: Extract specific identifiers (leagues, tickers, etc.)
   - For bet_structure: Extract syntax patterns (regex rules)
   - Build precedence rules for conflicts

3. **Model Generation**
   - Create/update `combined_heuristics_model.json`
   - Structure: `market_type_rules`, `subtype_keywords`, `bet_structure_rules`
   - Include confidence scores or priority ordering

4. **Validation**
   - Test heuristics model on sample of Gemini-classified markets
   - Calculate accuracy: % matching Gemini classifications
   - Target: 95%+ accuracy
   - Identify and refine low-confidence rules

### Phase 3: Integration & Automation
**Goal**: Use heuristics model for new markets

**Steps**:
1. **Update Existing Script**
   - Enhance `scripts/backfill-market-heuristics.js` with improved model
   - Add fallback to Gemini API for uncertain cases (optional)

2. **Automated Classification**
   - Classify new markets as they're added to database
   - Use heuristics model first (fast, free)
   - Flag uncertain classifications for manual review

3. **Continuous Improvement**
   - Periodically re-run Gemini on new markets to update model
   - Track heuristics accuracy over time
   - Refine model based on new patterns

## Implementation Details

### Scripts to Create

1. **`scripts/gemini-classify-markets.js`**
   - Fetches markets from database in batches
   - Calls Gemini API with classification prompt
   - Stores results in database
   - Handles rate limiting and retries
   - Progress tracking and resume capability

2. **`scripts/build-heuristics-from-gemini.js`**
   - Analyzes Gemini classifications
   - Extracts keyword patterns
   - Generates/updates heuristics model JSON
   - Validation and accuracy reporting

3. **`scripts/validate-heuristics.js`**
   - Compares heuristics model vs Gemini classifications
   - Reports accuracy metrics
   - Identifies misclassifications for review

### Data Flow

```
Markets Table (50k+)
    ↓
Export Script (CSV/JSON)
    ↓
Gemini API (Batch Processing)
    ↓
Store Classifications (DB + JSON backup)
    ↓
Pattern Analysis
    ↓
Heuristics Model Generation
    ↓
Validation & Refinement
    ↓
Update combined_heuristics_model.json
    ↓
Use for Future Classifications
```

### Gemini Prompt Structure

```
Role: Deterministic Heuristic Classifier for Prediction Markets
Goal: Map Polymarket data to standardized taxonomy with 95%+ accuracy

[Classification Schema]
[Heuristic Logic Rules]
[Conflict Resolution Rules]
[Taxonomy Reference]

Task: Analyze the provided markets. Return JSON array:
[
  {
    "condition_id": "...",
    "market_type": "...",
    "market_subtype": "...",
    "bet_structure": "..."
  }
]

Markets Data:
[Batch of 50-100 markets with title, description, tags]
```

## Risk Mitigation

1. **API Rate Limits**: Implement exponential backoff, batch processing
2. **Cost Overruns**: Set daily/monthly limits, monitor usage
3. **Data Quality**: Validate JSON responses, handle malformed data
4. **Model Accuracy**: Start with sample, validate before full run
5. **Resume Capability**: Track progress, allow resuming from checkpoint

## Success Metrics

- ✅ 50k+ markets classified via Gemini
- ✅ Heuristics model achieves 95%+ accuracy vs Gemini
- ✅ Model covers all major market types and structures
- ✅ Automated classification pipeline operational
- ✅ Cost: < $5 for full backfill

## Implementation Status

✅ **Completed:**
1. Installed `@google/generative-ai` package
2. Created `scripts/gemini-classify-markets.js` - Classifies markets using Gemini API
3. Created `scripts/build-heuristics-from-gemini.js` - Builds heuristics model from Gemini results
4. Created `scripts/validate-heuristics.js` - Validates heuristics model accuracy

## Usage

### Step 1: Run Gemini Classification
```bash
node scripts/gemini-classify-markets.js
```

This will:
- Fetch all markets from database
- Classify them in batches using Gemini 1.5 Flash
- Overwrite existing classifications in database
- Save results to `gemini-classifications.json`
- Save market data to `markets_data.json`

**Environment Variables:**
- `GEMINI_API_KEY` - Required (already set in .env.local)
- `BATCH_SIZE` - Optional, default 50 (markets per Gemini API call)
- `DB_BATCH_SIZE` - Optional, default 100 (markets per DB fetch)
- `SLEEP_MS` - Optional, default 1000ms (sleep between API calls)
- `LIMIT` - Optional, limit number of markets to process (for testing)

**Example (test with 1000 markets):**
```bash
LIMIT=1000 node scripts/gemini-classify-markets.js
```

### Step 2: Build Heuristics Model
```bash
node scripts/build-heuristics-from-gemini.js
```

This will:
- Analyze Gemini classifications
- Extract keyword patterns
- Generate `combined_heuristics_model.json`
- Print summary statistics

### Step 3: Validate Heuristics Model
```bash
node scripts/validate-heuristics.js
```

This will:
- Compare heuristics predictions vs Gemini classifications
- Calculate accuracy metrics
- Identify common error patterns
- Print top misclassifications

### Step 4: Use Heuristics for New Markets
After validation, use the existing `scripts/backfill-market-heuristics.js` with the updated model:
```bash
node scripts/backfill-market-heuristics.js
```

## Cost Estimates

- **Gemini 1.5 Flash Pricing:**
  - Input: ~$0.075 per 1M tokens
  - Output: ~$0.30 per 1M tokens
  
- **Per Market Estimate:**
  - Input: ~200 tokens (title + description + tags)
  - Output: ~50 tokens (JSON classification)
  - Cost: ~$0.00002 per market

- **50k Markets:**
  - Total cost: ~$1-2

## Monitoring

The scripts include progress tracking and will:
- Show batch progress
- Save results incrementally
- Handle errors gracefully
- Allow resuming (by adjusting offset/limit)

## Next Steps

1. ✅ Scripts created
2. ⏳ Run Gemini classification on all markets
3. ⏳ Build heuristics model from results
4. ⏳ Validate accuracy (target: 95%+)
5. ⏳ Refine model if needed
6. ⏳ Deploy for automated use
