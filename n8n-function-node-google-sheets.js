// Function Node: Format Agent Output for Google Sheets
// Place this between Agent Node and Google Sheets Node

const agentOutput = $input.item.json;

// Extract all trades
const allTrades = agentOutput.all_trades || [];
const selectedTrades = agentOutput.selected_trades || [];

// Create a map of selected trades by trade_id for quick lookup
const selectedMap = {};
selectedTrades.forEach(trade => {
  selectedMap[trade.trade_id] = trade;
});

// Format for Google Sheets - one row per trade
const sheetRows = allTrades.map(trade => {
  const selected = selectedMap[trade.trade_id];
  
  // Truncate wallet address if not already truncated
  const walletTruncated = selected?.wallet_truncated || 
    (trade.wallet_address ? `${trade.wallet_address.substring(0, 6)}...${trade.wallet_address.substring(trade.wallet_address.length - 4)}` : '');
  
  return {
    json: {
      // Tweet columns (only filled for selected trades)
      tweet: selected?.tweet || '',
      tweet_reply: selected?.tweet_reply || '',
      tweet_selected: selected ? 'Yes' : 'No',
      
      // Trade identification
      trade_id: trade.trade_id,
      wallet_address: trade.wallet_address,
      wallet_truncated: walletTruncated,
      polycopy_url: trade.polycopy_url || `https://polycopy.app/trader/${trade.wallet_address}`,
      
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
      mins_before_close: trade.mins_before_close || null,
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

return sheetRows;
