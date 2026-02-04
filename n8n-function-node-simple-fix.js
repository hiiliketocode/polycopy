// Function Node: Format Final Output - SIMPLE FIXED VERSION
// Handles nested output structure from agent

const inputItems = $input.all();

if (inputItems.length === 0) {
  return [];
}

const firstItem = inputItems[0].json;

// Extract trades - handle nested output structure
let allTrades = [];

// Check for output.all_trades (agent output structure)
if (firstItem.output && firstItem.output.all_trades) {
  allTrades = firstItem.output.all_trades;
}
// Check for all_trades at top level
else if (firstItem.all_trades) {
  allTrades = firstItem.all_trades;
}
// Check if input items are individual trades
else if (firstItem.trade_id) {
  allTrades = inputItems.map(item => item.json);
}
// Last resort
else {
  allTrades = inputItems.map(item => item.json).filter(item => item && item.trade_id);
}

if (allTrades.length === 0) {
  return [];
}

// Format for Google Sheets
const sheetRows = allTrades.map(trade => {
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
      
      // Trade ID
      trade_id: trade.trade_id || '',
      wallet_address: trade.wallet_address || '',
      wallet_truncated: walletTruncated,
      polycopy_url: polycopyUrl,
      
      // Market
      market_title: trade.market_title || '',
      market_type: trade.market_type || '',
      market_subtype: trade.market_subtype || '',
      bet_structure: trade.bet_structure || '',
      
      // Trade data
      entry_price: trade.entry_price || 0,
      invested_usd: trade.invested_usd || 0,
      profit_usd: trade.profit_usd || 0,
      roi_pct: trade.roi_pct || 0,
      
      // Timing (CRITICAL: Include timestamp)
      timestamp: trade.timestamp || '',
      trade_timestamp_formatted: trade.trade_timestamp_formatted || trade.timestamp || '',
      mins_before_close: trade.mins_before_close !== undefined && trade.mins_before_close !== null ? trade.mins_before_close : null,
      market_close_time: trade.market_close_time || '',
      
      // Research context
      research_context: trade.research_context || '',
      trader_context: trade.trader_context || '',
      timing_context: trade.timing_context || '',
      why_smart: trade.why_smart || '',
      
      // Excitement
      excitement_score: trade.excitement_score || 0,
      excitement_category: trade.excitement_category || '',
      
      // Trader stats
      lifetime_win_rate: trade.lifetime_win_rate || 0,
      lifetime_pnl_usd: trade.lifetime_pnl_usd || 0,
      lifetime_trade_count: trade.lifetime_trade_count || 0
    }
  };
});

return sheetRows;
