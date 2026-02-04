# n8n Output Formatting Guide: Readable Tweets with Links

## Output Structure

Each trade will have these formatted fields:

### 1. tweet_main
**Format:** Main tweet text only (no link, no ↓ symbol)
**Line breaks:** Use `\n` for single breaks, `\n\n` for paragraphs
**Length:** Under 280 characters
**Example:**
```
0x31a5...8ed9 bet Yes on "Maduro out by Jan 31". Entry: 8.2% Result: Yes ROI: +1,122.3%

They went big right before resolution. That's conviction.

Would you have made this call?
```

### 2. tweet_reply
**Format:** Reply thread with Polycopy link
**Must include:** ↓ symbol + full URL
**Example:**
```
↓ https://polycopy.app/trader/0x31a56e9e690c621ed21de08cb559e9524cdb8ed9
```

### 3. tweet_full
**Format:** Complete tweet ready to post
**Structure:** Main tweet + double newline + reply
**Example:**
```
0x31a5...8ed9 bet Yes on "Maduro out by Jan 31". Entry: 8.2% Result: Yes ROI: +1,122.3%

They went big right before resolution. That's conviction.

Would you have made this call?

↓ https://polycopy.app/trader/0x31a56e9e690c621ed21de08cb559e9524cdb8ed9
```

### 4. polycopy_url
**Format:** Full Polycopy trader URL
**Structure:** `https://polycopy.app/trader/{full_wallet_address}`
**Example:**
```
https://polycopy.app/trader/0x31a56e9e690c621ed21de08cb559e9524cdb8ed9
```

## Google Sheets Columns

Recommended columns for easy reading:

| Column | Description | Example |
|--------|-------------|---------|
| `tweet_main` | Main tweet (readable) | Formatted text with line breaks |
| `tweet_reply` | Reply with link | ↓ https://polycopy.app/trader/... |
| `tweet_full` | Complete tweet | Main + reply combined |
| `tweet_ready_to_post` | Copy/paste ready | Same as tweet_full |
| `polycopy_url` | Trader profile URL | Full URL for easy access |
| `wallet_address` | Full wallet | 0x31a56e9e690c621... |
| `wallet_truncated` | Display format | 0x31a5...8ed9 |
| `market_title` | Market name | "Maduro out by Jan 31" |
| `roi_pct` | ROI percentage | 1122.3 |
| `profit_usd` | Profit amount | 80971.77 |
| `invested_usd` | Investment | 7215.0 |
| `excitement_category` | Category | "Whale Trade" |

## Formatting Rules

### Line Breaks
- Single line break: `\n`
- Paragraph break: `\n\n`
- Between main and reply: `\n\n`

### Links
- Always use full wallet address in URLs
- Always start reply with ↓ symbol
- Format: `↓ https://polycopy.app/trader/{full_wallet_address}`

### Readability
- Use proper paragraph breaks for readability
- Keep main tweet scannable
- Front-load strongest stat (ROI or profit)
- End with engagement hook

## For Twitter/X Posting

**Option 1: Separate Posts**
1. Copy `tweet_main` → Post as main tweet
2. Copy `tweet_reply` → Post as reply thread

**Option 2: Single Copy**
1. Copy `tweet_full` → Split at `\n\n` → Post separately

**Option 3: Ready-to-Post**
1. Copy `tweet_ready_to_post` → Use as-is (if tool supports multi-line)

## Function Node Processing

The Function Node (`n8n-function-node-format-tweets.js`) will:
- Convert `\n` to actual line breaks for display
- Ensure `polycopy_url` is always present
- Create `tweet_ready_to_post` field
- Format for Google Sheets readability

All trades will have properly formatted tweets with Polycopy links included!
