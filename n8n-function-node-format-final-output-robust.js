// Function Node: Format Final Output (Robust Version)
// Handles any input structure and formats for Google Sheets

// Get all input items
const inputItems = $input.all();

// Extract trades from various possible structures
let allTrades = [];

if (inputItems.length === 0) {
  return [];
}

// Try different ways to extract trades
const firstItem = inputItems[0].json;

// Method 1: Check for all_trades array
if (firstItem.all_trades && Array.isArray(firstItem.all_trades)) {
  allTrades = firstItem.all_trades;
  console.log('Found trades in all_trades:', allTrades.length);
}
// Method 2: Check if first item is an array
else if (Array.isArray(firstItem)) {
  allTrades = firstItem;
  console.log('Found trades as array:', allTrades.length);
}
// Method 3: Check if inputItems are individual trades
else if (firstItem.trade_id) {
  allTrades = inputItems.map(item => item.json);
  console.log('Found trades as individual items:', allTrades.length);
}
// Method 4: Check for selected_trades
else if (firstItem.selected_trades && Array.isArray(firstItem.selected_trades)) {
  allTrades = firstItem.selected_trades;
  console.log('Found trades in selected_trades:', allTrades.length);
}
// Method 5: Last resort - use all input items
else {
  allTrades = inputItems.map(item => item.json).filter(item => item && typeof item === 'object');
  console.log('Using all input items as trades:', allTrades.length);
}

// If still no trades, return empty
if (allTrades.length === 0) {
  console.log('WARNING: No trades found in input');
  return [];
}

// Format for Google Sheets - one row per trade
const sheetRows = allTrades
  .filter(trade => trade && trade.trade_id) // Only process valid trades
  .map(trade => {
    // Truncate wallet address if not already truncated
    const walletTruncated = trade.wallet_truncated || 
      (trade.wallet_address ? `${trade.wallet_address.substring(0, 6)}...${trade.wallet_address.substring(trade.wallet_address.length - 4)}` : '');
    
    // Ensure polycopy_url is always present and properly formatted
    const polycopyUrl = trade.polycopy_url || 
      (trade.wallet_address ? `https://polycopy.app/trader/${trade.wallet_address}` : '');
    
    // Format tweets for readability
    let tweetMainFormatted = '';
    let tweetReplyFormatted = '';
    let tweetFullFormatted = '';
    
    if (trade.tweet_main) {
      // Convert \n to actual line breaks for display
      tweetMainFormatted = String(trade.tweet_main).replace(/\\n/g, '\n');
      tweetReplyFormatted = trade.tweet_reply ? String(trade.tweet_reply).replace(/\\n/g, '\n') : 
        (polycopyUrl ? `↓ ${polycopyUrl}` : '');
      tweetFullFormatted = trade.tweet_full ? String(trade.tweet_full).replace(/\\n/g, '\n') : 
        (tweetMainFormatted && tweetReplyFormatted ? `${tweetMainFormatted}\n\n${tweetReplyFormatted}` : '');
    } else if (trade.tweet) {
      // Handle old format with just 'tweet' field
      tweetMainFormatted = String(trade.tweet).replace(/\\n/g, '\n');
      tweetReplyFormatted = polycopyUrl ? `↓ ${polycopyUrl}` : '';
      tweetFullFormatted = tweetMainFormatted && tweetReplyFormatted ? `${tweetMainFormatted}\n\n${tweetReplyFormatted}` : '';
    } else if (polycopyUrl) {
      // If no tweet but we have URL, create basic reply
      tweetReplyFormatted = `↓ ${polycopyUrl}`;
    }
    
    // Create tweet_ready_to_post
    const tweetReadyToPost = tweetFullFormatted || 
      (tweetMainFormatted && tweetReplyFormatted ? `${tweetMainFormatted}\n\n${tweetReplyFormatted}` : '');
    
    return {
      json: {
        // Tweet columns - properly formatted
        tweet_main: tweetMainFormatted,
        tweet_reply: tweetReplyFormatted,
        tweet_full: tweetFullFormatted,
        tweet_ready_to_post: tweetReadyToPost,
        
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
        shares: trade.shares || 0,
        
        // Trade outcomes
        token_label: trade.token_label || '',
        winning_label: trade.winning_label || '',
        
        // Timing
        timestamp: trade.timestamp || '',
        mins_before_close: trade.mins_before_close !== undefined && trade.mins_before_close !== null ? trade.mins_before_close : null,
        market_close_time: trade.market_close_time || '',
        
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

console.log('Formatted rows for Google Sheets:', sheetRows.length);

// Return formatted rows
return sheetRows;
