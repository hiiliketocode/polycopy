# n8n Output Format Guide: Readable Tweets

## Best Format for Readable Tweets

For Google Sheets and easy reading, use **separate columns** with formatted text:

### Recommended Google Sheets Columns:

1. **tweet_main** - Main tweet text (no link)
   - Line breaks preserved with `\n`
   - Ready to copy/paste
   - Under 280 characters

2. **tweet_reply** - Reply thread with link
   - Format: `↓ https://polycopy.app/trader/0x...`
   - Separate column for easy management

3. **tweet_full** - Complete tweet ready to post
   - Main + reply combined
   - Use `\n\n` between main and reply
   - Perfect for copy/paste to Twitter

4. **tweet_ready_to_post** - Single field with everything
   - Most convenient for quick posting
   - Includes all formatting and links

## Output Format in JSON

The agent outputs:
```json
{
  "tweet_main": "0x31a5...8ed9 bet Yes on \"Maduro out by Jan 31\". Entry: 8.2% Result: Yes ROI: +1,122.3%\n\nThey went big right before resolution. That's conviction.\n\nWould you have made this call?",
  "tweet_reply": "↓ https://polycopy.app/trader/0x31a56e9e690c621...",
  "tweet_full": "0x31a5...8ed9 bet Yes on \"Maduro out by Jan 31\". Entry: 8.2% Result: Yes ROI: +1,122.3%\n\nThey went big right before resolution. That's conviction.\n\nWould you have made this call?\n\n↓ https://polycopy.app/trader/0x31a56e9e690c621..."
}
```

## Function Node Processing

Use the Function Node (`n8n-function-node-format-tweets.js`) to:
- Convert `\n` to actual line breaks for display
- Create `tweet_ready_to_post` field
- Format for Google Sheets readability

## Google Sheets Display

After processing, Google Sheets will show:

| tweet_main | tweet_reply | tweet_full | tweet_ready_to_post |
|------------|-------------|------------|---------------------|
| 0x31a5...8ed9 bet Yes...<br><br>They went big...<br><br>Would you have... | ↓ https://polycopy.app/trader/... | Full formatted tweet... | Complete ready-to-post version |

## Best Practice: Use `tweet_full` or `tweet_ready_to_post`

For easiest use:
- **tweet_full**: Complete tweet with formatting
- **tweet_ready_to_post**: Single field, copy/paste ready

Both include:
- Main tweet text
- Line breaks for readability
- Reply thread with link
- Proper formatting

## For Twitter/X Posting

1. Copy `tweet_main` → Post as main tweet
2. Copy `tweet_reply` → Post as reply thread

OR

1. Copy `tweet_full` → Split at `\n\n` → Post main + reply separately

OR

1. Copy `tweet_ready_to_post` → Use as-is (if your tool supports multi-line)

## Formatting Tips

- Use `\n` for line breaks (converted to actual breaks in Function Node)
- Keep main tweet under 280 chars
- Reply can be longer (just the link)
- Links always start with `↓` symbol

This format gives you maximum flexibility for reading, editing, and posting!
