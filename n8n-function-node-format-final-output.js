// Function Node: Format Final Output for Google Sheets
// Place this between Agent Node (or Clean JSON Node) and Google Sheets
// Handles agent output structure and formats tweets properly

// Get input - might be from agent directly or from clean JSON node
const inputData = $input.all();

// Handle different input structures
let allTrades = [];

if (inputData.length > 0) {
  const firstItem = inputData[0].json;
  
  // Check if agent output has all_trades array
  if (firstItem.all_trades && Array.isArray(firstItem.all_trades)) {
    allTrades = firstItem.all_trades;
  } 
  // Check if input is already an array of trades
  else if (Array.isArray(firstItem)) {
    allTrades = firstItem;
  }
  // Check if input is a single trade object
  else if (firstItem.trade_id) {
    allTrades = inputData.map(item => item.json);
  }
  // Fallback: try to find trades in the structure
  else {
    // Look for trades in various possible locations
    const possibleTrades = firstItem.selected_trades || firstItem.trades || [];
    if (Array.isArray(possibleTrades) && possibleTrades.length > 0) {
      allTrades = possibleTrades;
    } else {
      // Last resort: use all input items as trades
      allTrades = inputData.map(item => item.json);
    }
  }
}

// Format for Google Sheets - one row per trade
const sheetRows = allTrades.map(trade => {
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
      mins_before_close: trade.mins_before_close !== undefined ? trade.mins_before_close : null,
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

// Return formatted rows
return sheetRows;
