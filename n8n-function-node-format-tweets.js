// Function Node: Format Tweets for Easy Reading
// Place this between Agent Node and Google Sheets Node
// Converts \n to actual line breaks and formats for readability

// Handle different input structures
const inputData = $input.all();
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
  // Fallback: use all input items as trades
  else {
    allTrades = inputData.map(item => item.json);
  }
}

// Debug: Log what we're working with
console.log('Total trades to process:', allTrades.length);
console.log('First trade sample:', allTrades[0]);

// Format for Google Sheets - one row per trade
const sheetRows = allTrades.map((trade, index) => {
  // Safety check
  if (!trade || typeof trade !== 'object') {
    console.log(`Skipping invalid trade at index ${index}:`, trade);
    return null;
  }
  // Truncate wallet address if not already truncated
  const walletTruncated = trade.wallet_truncated || 
    (trade.wallet_address ? `${trade.wallet_address.substring(0, 6)}...${trade.wallet_address.substring(trade.wallet_address.length - 4)}` : '');
  
  // Ensure polycopy_url is always present and properly formatted
  const polycopyUrl = trade.polycopy_url || 
    (trade.wallet_address ? `https://polycopy.app/trader/${trade.wallet_address}` : '');
  
  // Format tweets for readability (all trades have tweets now)
  let tweetMainFormatted = '';
  let tweetReplyFormatted = '';
  let tweetFullFormatted = '';
  
  if (trade.tweet_main) {
    // Convert \n to actual line breaks for display
    tweetMainFormatted = trade.tweet_main.replace(/\\n/g, '\n');
    tweetReplyFormatted = trade.tweet_reply || (polycopyUrl ? `↓ ${polycopyUrl}` : '');
    tweetFullFormatted = trade.tweet_full ? trade.tweet_full.replace(/\\n/g, '\n') : 
      (tweetMainFormatted && polycopyUrl ? `${tweetMainFormatted}\n\n↓ ${polycopyUrl}` : '');
  } else if (polycopyUrl) {
    // If no tweet_main but we have URL, create basic reply
    tweetReplyFormatted = `↓ ${polycopyUrl}`;
  }
  
  return {
    json: {
      // Tweet columns (all trades have tweets) - properly formatted
      tweet_main: tweetMainFormatted,
      tweet_reply: tweetReplyFormatted,
      tweet_full: tweetFullFormatted || (tweetMainFormatted && tweetReplyFormatted ? `${tweetMainFormatted}\n\n${tweetReplyFormatted}` : ''),
      tweet_ready_to_post: tweetFullFormatted || (tweetMainFormatted && tweetReplyFormatted ? `${tweetMainFormatted}\n\n${tweetReplyFormatted}` : ''),
      
      // Trade identification
      trade_id: trade.trade_id,
      wallet_address: trade.wallet_address,
      wallet_truncated: walletTruncated,
      polycopy_url: polycopyUrl,
      
      // Market information
      market_title: trade.market_title || '',
      market_type: trade.market_type || '',
      market_subtype: trade.market_subtype || '',
      bet_structure: trade.bet_structure || '',
      
      // Trade execution data
      entry_price: trade.entry_price || 0,
      invested_usd: trade.invested_usd || 0,
      profit_usd: trade.profit_usd || 0,
      roi_pct: trade.roi_pct || 0,
      
      // Timing
      mins_before_close: trade.mins_before_close || null,
      
      // Excitement metrics
      excitement_score: trade.excitement_score || 0,
      excitement_category: trade.excitement_category || '',
      
      // Trader stats
      lifetime_win_rate: trade.lifetime_win_rate || 0,
      lifetime_pnl_usd: trade.lifetime_pnl_usd || 0
    }
  };
}).filter(item => item !== null); // Remove any null entries

// Debug: Log output
console.log('Formatted rows:', sheetRows.length);

// Return formatted rows
return sheetRows;
