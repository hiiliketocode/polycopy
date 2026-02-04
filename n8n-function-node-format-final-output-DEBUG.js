// Function Node: Format Final Output - DEBUG VERSION
// This logs EVERYTHING to help diagnose the issue
// Mode: "Run Once for All Items"

const inputItems = $input.all();

console.log('=== FULL DEBUG START ===');
console.log('Input items count:', inputItems.length);

if (inputItems.length === 0) {
  return [{ json: { error: 'No input received' } }];
}

// Log the ENTIRE input structure
console.log('=== RAW INPUT ===');
console.log('inputItems:', JSON.stringify(inputItems, null, 2));

const firstItem = inputItems[0].json || inputItems[0];

console.log('=== FIRST ITEM ===');
console.log('firstItem:', JSON.stringify(firstItem, null, 2));
console.log('firstItem type:', typeof firstItem);
console.log('firstItem keys:', firstItem ? Object.keys(firstItem) : 'N/A');

// Extract trades - try ALL methods, don't use else-if
let allTrades = [];

// Method 1: Direct all_trades
if (firstItem && firstItem.all_trades) {
  console.log('Method 1: Found all_trades property');
  console.log('  Type:', typeof firstItem.all_trades);
  console.log('  Is Array:', Array.isArray(firstItem.all_trades));
  if (Array.isArray(firstItem.all_trades)) {
    allTrades = firstItem.all_trades;
    console.log('  ✓ SUCCESS: Extracted', allTrades.length, 'trades');
  } else {
    console.log('  ✗ FAILED: all_trades is not an array');
  }
}

// Method 2: output.all_trades (only if Method 1 failed)
if (allTrades.length === 0 && firstItem && firstItem.output) {
  console.log('Method 2: Found output property');
  if (firstItem.output.all_trades) {
    console.log('  Found output.all_trades');
    console.log('  Type:', typeof firstItem.output.all_trades);
    console.log('  Is Array:', Array.isArray(firstItem.output.all_trades));
    if (Array.isArray(firstItem.output.all_trades)) {
      allTrades = firstItem.output.all_trades;
      console.log('  ✓ SUCCESS: Extracted', allTrades.length, 'trades');
    }
  }
}

// Method 3: First item is array
if (allTrades.length === 0 && Array.isArray(firstItem)) {
  console.log('Method 3: firstItem is an array');
  allTrades = firstItem;
  console.log('  ✓ SUCCESS: Extracted', allTrades.length, 'trades');
}

// Method 4: Individual items
if (allTrades.length === 0 && firstItem && firstItem.trade_id) {
  console.log('Method 4: firstItem has trade_id');
  allTrades = inputItems.map(item => (item.json || item)).filter(item => item && item.trade_id);
  console.log('  ✓ SUCCESS: Extracted', allTrades.length, 'trades');
}

// Method 5: Filter all items
if (allTrades.length === 0) {
  console.log('Method 5: Filtering all input items');
  const mapped = inputItems.map(item => (item.json || item));
  console.log('  Mapped items:', mapped.length);
  allTrades = mapped.filter(item => item && item.trade_id);
  console.log('  ✓ Extracted', allTrades.length, 'trades');
}

console.log('=== EXTRACTION RESULT ===');
console.log('Total trades:', allTrades.length);

if (allTrades.length > 0) {
  console.log('First trade:', JSON.stringify(allTrades[0], null, 2).substring(0, 500));
} else {
  console.log('=== ERROR: NO TRADES FOUND ===');
  console.log('Full firstItem:', JSON.stringify(firstItem, null, 2));
  return [{ 
    json: { 
      error: 'No trades found', 
      debug: 'See console logs above',
      first_item_keys: firstItem ? Object.keys(firstItem) : [],
      first_item_sample: JSON.stringify(firstItem, null, 2).substring(0, 500)
    } 
  }];
}

// Format for Google Sheets (same as before)
const sheetRows = allTrades
  .filter(trade => trade && typeof trade === 'object' && trade.trade_id)
  .map(trade => {
    const walletTruncated = trade.wallet_truncated || 
      (trade.wallet_address ? `${trade.wallet_address.substring(0, 6)}...${trade.wallet_address.substring(trade.wallet_address.length - 4)}` : '');
    
    const polycopyUrl = trade.polycopy_url || 
      (trade.wallet_address ? `https://polycopy.app/trader/${trade.wallet_address}` : '');
    
    let tweetMain = '';
    let tweetReply = '';
    let tweetFull = '';
    
    if (trade.tweet_main) {
      tweetMain = String(trade.tweet_main).replace(/\\n/g, '\n');
      tweetReply = trade.tweet_reply ? String(trade.tweet_reply).replace(/\\n/g, '\n') : 
        (polycopyUrl ? `↓ ${polycopyUrl}` : '');
      tweetFull = trade.tweet_full ? String(trade.tweet_full).replace(/\\n/g, '\n') : 
        (tweetMain && tweetReply ? `${tweetMain}\n\n${tweetReply}` : '');
    } else if (polycopyUrl) {
      tweetReply = `↓ ${polycopyUrl}`;
    }
    
    return {
      json: {
        tweet_main: tweetMain,
        tweet_reply: tweetReply,
        tweet_full: tweetFull,
        tweet_ready_to_post: tweetFull || (tweetMain && tweetReply ? `${tweetMain}\n\n${tweetReply}` : ''),
        trade_id: trade.trade_id || '',
        wallet_address: trade.wallet_address || '',
        wallet_truncated: walletTruncated,
        polycopy_url: polycopyUrl,
        market_title: trade.market_title || '',
        market_type: trade.market_type || '',
        market_subtype: trade.market_subtype || '',
        bet_structure: trade.bet_structure || '',
        entry_price: trade.entry_price || 0,
        invested_usd: trade.invested_usd || 0,
        profit_usd: trade.profit_usd || 0,
        roi_pct: trade.roi_pct || 0,
        timestamp: trade.timestamp || '',
        trade_timestamp_formatted: trade.trade_timestamp_formatted || trade.timestamp || '',
        mins_before_close: trade.mins_before_close !== undefined && trade.mins_before_close !== null ? trade.mins_before_close : null,
        market_close_time: trade.market_close_time || '',
        research_context: trade.research_context || '',
        trader_context: trade.trader_context || '',
        timing_context: trade.timing_context || '',
        why_smart: trade.why_smart || '',
        excitement_score: trade.excitement_score || 0,
        excitement_category: trade.excitement_category || '',
        lifetime_win_rate: trade.lifetime_win_rate || 0,
        lifetime_pnl_usd: trade.lifetime_pnl_usd || 0,
        lifetime_trade_count: trade.lifetime_trade_count || 0
      }
    };
  });

console.log('=== FINAL RESULT ===');
console.log('Formatted rows:', sheetRows.length);

return sheetRows.length > 0 ? sheetRows : [{ json: { error: 'No trades processed' } }];
