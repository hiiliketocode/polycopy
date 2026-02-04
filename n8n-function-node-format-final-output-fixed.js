// Function Node: Format Final Output for Google Sheets
// Mode: "Run Once for All Items"
// Returns: One item per trade (each trade becomes a separate row)

const inputItems = $input.all();

if (inputItems.length === 0) {
  return [{ json: { error: 'No input received' } }];
}

let firstItem = inputItems[0].json || inputItems[0];

// CRITICAL: Parse JSON string if needed (agent outputs JSON as string)
if (typeof firstItem === 'string') {
  try {
    firstItem = JSON.parse(firstItem);
  } catch (e) {
    console.log('Failed to parse string as JSON:', e);
  }
}

// Also check if firstItem.output is a string that needs parsing
if (firstItem && firstItem.output && typeof firstItem.output === 'string') {
  try {
    firstItem.output = JSON.parse(firstItem.output);
  } catch (e) {
    console.log('Failed to parse output string:', e);
  }
}

// Extract trades
let allTrades = [];

if (firstItem && firstItem.all_trades && Array.isArray(firstItem.all_trades)) {
  allTrades = firstItem.all_trades;
} else if (firstItem && firstItem.output && firstItem.output.all_trades && Array.isArray(firstItem.output.all_trades)) {
  allTrades = firstItem.output.all_trades;
} else if (Array.isArray(firstItem)) {
  allTrades = firstItem;
} else if (firstItem && firstItem.trade_id) {
  allTrades = inputItems.map(item => {
    let json = item.json || item;
    if (typeof json === 'string') {
      try {
        json = JSON.parse(json);
      } catch (e) {}
    }
    return json;
  }).filter(item => item && item.trade_id);
} else {
  allTrades = inputItems.map(item => {
    let json = item.json || item;
    if (typeof json === 'string') {
      try {
        json = JSON.parse(json);
      } catch (e) {}
    }
    return json;
  }).filter(item => item && item.trade_id);
}

if (allTrades.length === 0) {
  return [{ json: { error: 'No trades found' } }];
}

// Return ONE item per trade - n8n will automatically create separate output items
return allTrades
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
    
    // Return ONE item per trade
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
