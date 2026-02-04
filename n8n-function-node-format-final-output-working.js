// Function Node: Format Final Output - WORKING VERSION
// Handles: {"all_trades": [...]} or {"output": {"all_trades": [...]}}
// Mode: "Run Once for All Items"

const inputItems = $input.all();

console.log('=== DEBUG START ===');
console.log('Input items count:', inputItems.length);

if (inputItems.length === 0) {
  return [{ json: { error: 'No input received' } }];
}

const firstItem = inputItems[0].json || inputItems[0];

console.log('First item:', firstItem);
console.log('First item keys:', Object.keys(firstItem || {}));

// Extract trades - try multiple structures
let allTrades = [];

// Try 1: Direct all_trades at top level (MOST COMMON CASE)
if (firstItem && firstItem.all_trades) {
  if (Array.isArray(firstItem.all_trades)) {
    allTrades = firstItem.all_trades;
    console.log('✓ Found all_trades array:', allTrades.length);
  } else {
    console.log('WARNING: all_trades exists but is not an array:', typeof firstItem.all_trades);
  }
}
// Try 2: Nested output.all_trades
else if (firstItem && firstItem.output && firstItem.output.all_trades) {
  if (Array.isArray(firstItem.output.all_trades)) {
    allTrades = firstItem.output.all_trades;
    console.log('✓ Found output.all_trades array:', allTrades.length);
  }
}
// Try 3: Input items are individual trades
else if (firstItem && firstItem.trade_id) {
  allTrades = inputItems.map(item => (item.json || item)).filter(item => item && item.trade_id);
  console.log('✓ Found trades as individual items:', allTrades.length);
}
// Try 4: First item is an array
else if (Array.isArray(firstItem)) {
  allTrades = firstItem;
  console.log('✓ Found trades as array:', allTrades.length);
}
// Try 5: Last resort - map all input items
else {
  allTrades = inputItems.map(item => (item.json || item)).filter(item => item && item.trade_id);
  console.log('✓ Using filtered input items:', allTrades.length);
}

console.log('Total trades extracted:', allTrades.length);

if (allTrades.length === 0) {
  console.log('ERROR: No trades found after all attempts');
  console.log('First item structure:', JSON.stringify(firstItem, null, 2).substring(0, 500));
  return [{ json: { error: 'No trades found', debug: 'Check console logs', sample_keys: Object.keys(firstItem || {}) } }];
}

// Format for Google Sheets
const sheetRows = allTrades
  .filter(trade => {
    if (!trade || typeof trade !== 'object') {
      return false;
    }
    if (!trade.trade_id) {
      console.log('Skipping trade without trade_id:', Object.keys(trade));
      return false;
    }
    return true;
  })
  .map(trade => {
    const walletTruncated = trade.wallet_truncated || 
      (trade.wallet_address ? `${trade.wallet_address.substring(0, 6)}...${trade.wallet_address.substring(trade.wallet_address.length - 4)}` : '');
    
    const polycopyUrl = trade.polycopy_url || 
      (trade.wallet_address ? `https://polycopy.app/trader/${trade.wallet_address}` : '');
    
    // Format tweets
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
        // Tweets
        tweet_main: tweetMain,
        tweet_reply: tweetReply,
        tweet_full: tweetFull,
        tweet_ready_to_post: tweetFull || (tweetMain && tweetReply ? `${tweetMain}\n\n${tweetReply}` : ''),
        
        // Trade identification
        trade_id: trade.trade_id || '',
        wallet_address: trade.wallet_address || '',
        wallet_truncated: walletTruncated,
        polycopy_url: polycopyUrl,
        
        // Market information
        market_title: trade.market_title || '',
        market_type: trade.market_type || '',
        market_subtype: trade.market_subtype || '',
        bet_structure: trade.bet_structure || '',
        market_slug: trade.market_slug || '',
        event_slug: trade.event_slug || '',
        
        // Trade execution data
        entry_price: trade.entry_price || 0,
        invested_usd: trade.invested_usd || 0,
        profit_usd: trade.profit_usd || 0,
        roi_pct: trade.roi_pct || 0,
        shares: trade.shares || trade.shares_normalized || 0,
        
        // Trade outcomes
        token_label: trade.token_label || '',
        winning_label: trade.winning_label || '',
        
        // Timing (CRITICAL: Include timestamp)
        timestamp: trade.timestamp || '',
        trade_timestamp_formatted: trade.trade_timestamp_formatted || trade.timestamp || '',
        mins_before_close: trade.mins_before_close !== undefined && trade.mins_before_close !== null ? trade.mins_before_close : null,
        market_close_time: trade.market_close_time || '',
        
        // Research context fields
        research_context: trade.research_context || '',
        trader_context: trade.trader_context || '',
        timing_context: trade.timing_context || '',
        why_smart: trade.why_smart || '',
        
        // Excitement metrics
        excitement_score: trade.excitement_score || 0,
        excitement_category: trade.excitement_category || '',
        
        // Trader stats
        lifetime_win_rate: trade.lifetime_win_rate || 0,
        lifetime_pnl_usd: trade.lifetime_pnl_usd || 0,
        lifetime_trade_count: trade.lifetime_trade_count || 0,
        trader_market_volume: trade.trader_market_volume || 0,
        
        // Additional metadata
        tx_hash: trade.tx_hash || '',
        order_hash: trade.order_hash || '',
        created_at: trade.created_at || ''
      }
    };
  });

console.log('=== DEBUG END ===');
console.log('Formatted rows:', sheetRows.length);

if (sheetRows.length === 0) {
  return [{ json: { error: 'No trades processed after filtering', debug: 'Check console logs' } }];
}

return sheetRows;
