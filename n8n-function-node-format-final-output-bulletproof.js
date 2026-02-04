// Function Node: Format Final Output - BULLETPROOF VERSION
// This version logs EVERYTHING and tries EVERY possible structure
// Mode: "Run Once for All Items"

const inputItems = $input.all();

console.log('=== FULL DEBUG START ===');
console.log('Input items count:', inputItems.length);
console.log('Input items:', JSON.stringify(inputItems, null, 2).substring(0, 2000));

if (inputItems.length === 0) {
  console.log('ERROR: No input items');
  return [{ json: { error: 'No input received' } }];
}

// Try to get first item - handle multiple formats
let firstItem = null;
if (inputItems[0]) {
  firstItem = inputItems[0].json || inputItems[0];
}

console.log('=== FIRST ITEM ANALYSIS ===');
console.log('First item exists?', !!firstItem);
console.log('First item type:', typeof firstItem);
console.log('First item keys:', firstItem ? Object.keys(firstItem) : 'N/A');
console.log('First item (first 2000 chars):', JSON.stringify(firstItem, null, 2).substring(0, 2000));

// Extract trades - try EVERY possible structure
let allTrades = [];
let extractionMethod = '';

// Method 1: Direct all_trades at top level
if (firstItem && firstItem.all_trades) {
  console.log('Found all_trades property');
  console.log('all_trades type:', typeof firstItem.all_trades);
  console.log('all_trades is array?', Array.isArray(firstItem.all_trades));
  if (Array.isArray(firstItem.all_trades)) {
    allTrades = firstItem.all_trades;
    extractionMethod = 'all_trades (top level)';
    console.log('✓ SUCCESS: Found', allTrades.length, 'trades via', extractionMethod);
  }
}

// Method 2: Nested output.all_trades
if (allTrades.length === 0 && firstItem && firstItem.output) {
  console.log('Found output property');
  if (firstItem.output.all_trades) {
    console.log('Found output.all_trades');
    console.log('output.all_trades type:', typeof firstItem.output.all_trades);
    console.log('output.all_trades is array?', Array.isArray(firstItem.output.all_trades));
    if (Array.isArray(firstItem.output.all_trades)) {
      allTrades = firstItem.output.all_trades;
      extractionMethod = 'output.all_trades';
      console.log('✓ SUCCESS: Found', allTrades.length, 'trades via', extractionMethod);
    }
  }
}

// Method 3: Check if firstItem itself is an array
if (allTrades.length === 0 && Array.isArray(firstItem)) {
  allTrades = firstItem;
  extractionMethod = 'firstItem is array';
  console.log('✓ SUCCESS: Found', allTrades.length, 'trades via', extractionMethod);
}

// Method 4: Input items are individual trades
if (allTrades.length === 0 && firstItem && firstItem.trade_id) {
  allTrades = inputItems.map(item => (item.json || item)).filter(item => item && item.trade_id);
  extractionMethod = 'individual items';
  console.log('✓ SUCCESS: Found', allTrades.length, 'trades via', extractionMethod);
}

// Method 5: Map all input items and filter
if (allTrades.length === 0) {
  const mapped = inputItems.map(item => (item.json || item));
  console.log('Mapped items count:', mapped.length);
  allTrades = mapped.filter(item => item && item.trade_id);
  extractionMethod = 'filtered mapped items';
  console.log('✓ Found', allTrades.length, 'trades via', extractionMethod);
}

// Method 6: Last resort - check if any property is an array of trades
if (allTrades.length === 0 && firstItem && typeof firstItem === 'object') {
  console.log('=== CHECKING ALL PROPERTIES ===');
  for (const key in firstItem) {
    const value = firstItem[key];
    if (Array.isArray(value) && value.length > 0) {
      console.log('Found array property:', key, 'with', value.length, 'items');
      // Check if first item looks like a trade
      if (value[0] && typeof value[0] === 'object' && value[0].trade_id) {
        allTrades = value;
        extractionMethod = `property: ${key}`;
        console.log('✓ SUCCESS: Found', allTrades.length, 'trades in property', key);
        break;
      }
    }
  }
}

console.log('=== EXTRACTION RESULT ===');
console.log('Extraction method:', extractionMethod);
console.log('Total trades extracted:', allTrades.length);

if (allTrades.length > 0) {
  console.log('First trade keys:', Object.keys(allTrades[0] || {}));
  console.log('First trade trade_id:', allTrades[0]?.trade_id);
}

if (allTrades.length === 0) {
  console.log('=== ERROR: NO TRADES FOUND ===');
  console.log('Full first item:', JSON.stringify(firstItem, null, 2));
  return [{ 
    json: { 
      error: 'No trades found', 
      debug: 'Check console logs',
      extraction_method: extractionMethod,
      first_item_keys: firstItem ? Object.keys(firstItem) : [],
      input_items_count: inputItems.length
    } 
  }];
}

// Format for Google Sheets
const sheetRows = allTrades
  .filter(trade => {
    if (!trade || typeof trade !== 'object') {
      console.log('Filtering out non-object:', typeof trade);
      return false;
    }
    if (!trade.trade_id) {
      console.log('Filtering out trade without trade_id. Keys:', Object.keys(trade));
      return false;
    }
    return true;
  })
  .map((trade, index) => {
    try {
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
          
          // Timing
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
    } catch (error) {
      console.log(`Error processing trade ${index}:`, error.message);
      return {
        json: {
          error: `Failed to process trade ${trade.trade_id || index}`,
          error_message: error.message
        }
      };
    }
  });

console.log('=== FINAL RESULT ===');
console.log('Formatted rows:', sheetRows.length);

if (sheetRows.length === 0) {
  return [{ json: { error: 'No trades processed after filtering', debug: 'Check console logs' } }];
}

console.log('✓ SUCCESS: Returning', sheetRows.length, 'rows');
return sheetRows;
