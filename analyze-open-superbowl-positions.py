#!/usr/bin/env python3
"""
Analysis: Top NFL Traders - Open Super Bowl Positions
Purpose: Find open positions for top NFL traders on upcoming Super Bowl markets
"""

import os
import sys
from datetime import datetime
from google.cloud import bigquery
from typing import List, Dict, Optional

# Load environment variables
try:
    from dotenv import load_dotenv
    load_dotenv('.env.local')
except ImportError:
    pass

# Force unbuffered output
sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)

# Configuration
PROJECT_ID = "gen-lang-client-0299056258"
DATASET = "polycopy_v1"

def get_bigquery_client():
    """Initialize BigQuery client."""
    return bigquery.Client(project=PROJECT_ID)

def run_open_positions_query(client: bigquery.Client) -> List[Dict]:
    """Run query to get open Super Bowl positions for top NFL traders."""
    query = """
    -- Step 1: Get top 20 traders by NFL PnL%
    WITH top_nfl_traders AS (
      SELECT 
        wallet_address,
        L_total_roi_pct as nfl_pnl_pct,
        L_win_rate as nfl_win_rate,
        L_count as nfl_trade_count
      FROM `gen-lang-client-0299056258.polycopy_v1.trader_profile_stats`
      WHERE final_niche = 'NFL'
        AND L_total_roi_pct IS NOT NULL
        AND L_count >= 5
      ORDER BY L_total_roi_pct DESC
      LIMIT 20
    ),

    -- Step 2: Find all Super Bowl markets (including open ones)
    superbowl_markets AS (
      SELECT 
        condition_id,
        title,
        status,
        winning_label,
        volume_total
      FROM `gen-lang-client-0299056258.polycopy_v1.markets`
      WHERE (
        (tags IS NOT NULL AND EXISTS (
          SELECT 1 FROM UNNEST(JSON_EXTRACT_ARRAY(tags)) AS tag
          WHERE LOWER(JSON_EXTRACT_SCALAR(tag)) LIKE '%superbowl%'
        ))
        OR LOWER(COALESCE(title, '')) LIKE '%superbowl%'
        OR LOWER(COALESCE(title, '')) LIKE '%super bowl%'
      )
      GROUP BY condition_id, title, status, winning_label, volume_total
    ),

    -- Step 3: Get all trades from top NFL traders on Super Bowl markets
    superbowl_trades AS (
      SELECT 
        t.wallet_address,
        t.timestamp,
        t.side,
        t.price,
        t.shares_normalized as size,
        t.condition_id,
        t.token_label,
        m.title as market_title,
        m.status as market_status,
        m.winning_label,
        m.volume_total,
        t.price * t.shares_normalized as trade_value_usd,
        tr.nfl_pnl_pct,
        tr.nfl_win_rate,
        tr.nfl_trade_count
      FROM `gen-lang-client-0299056258.polycopy_v1.trades` t
      INNER JOIN top_nfl_traders tr
        ON LOWER(t.wallet_address) = LOWER(tr.wallet_address)
      INNER JOIN superbowl_markets m
        ON t.condition_id = m.condition_id
      WHERE t.price IS NOT NULL
        AND t.shares_normalized IS NOT NULL
      ORDER BY t.wallet_address, t.timestamp ASC
    ),

    -- Step 4: Calculate position summaries per trader per market
    position_summary AS (
      SELECT 
        wallet_address,
        condition_id,
        market_title,
        token_label,
        market_status,
        winning_label,
        volume_total,
        nfl_pnl_pct,
        nfl_win_rate,
        nfl_trade_count,
        -- Net position size (BUYs - SELLs)
        SUM(CASE WHEN side = 'BUY' THEN size ELSE -size END) as net_position_size,
        -- Total cost basis (from BUYs only)
        SUM(CASE WHEN side = 'BUY' THEN trade_value_usd ELSE 0 END) as total_cost,
        -- Total proceeds (from SELLs only)
        SUM(CASE WHEN side = 'SELL' THEN trade_value_usd ELSE 0 END) as total_proceeds,
        -- Average entry price (weighted by size)
        CASE 
          WHEN SUM(CASE WHEN side = 'BUY' THEN size ELSE 0 END) > 0 THEN
            SUM(CASE WHEN side = 'BUY' THEN trade_value_usd ELSE 0 END) / 
            SUM(CASE WHEN side = 'BUY' THEN size ELSE 0 END)
          ELSE NULL
        END as avg_entry_price,
        -- Trade counts
        COUNT(*) as total_trades,
        COUNTIF(side = 'BUY') as buy_count,
        COUNTIF(side = 'SELL') as sell_count,
        -- Timestamps
        MIN(timestamp) as first_trade_time,
        MAX(timestamp) as last_trade_time
      FROM superbowl_trades
      GROUP BY 
        wallet_address,
        condition_id,
        market_title,
        token_label,
        market_status,
        winning_label,
        volume_total,
        nfl_pnl_pct,
        nfl_win_rate,
        nfl_trade_count
    ),

    -- Step 5: Filter for OPEN positions only
    open_positions AS (
      SELECT 
        wallet_address,
        condition_id,
        market_title,
        token_label,
        market_status,
        nfl_pnl_pct,
        nfl_win_rate,
        nfl_trade_count,
        net_position_size,
        total_cost,
        total_proceeds,
        avg_entry_price,
        total_trades,
        buy_count,
        sell_count,
        first_trade_time,
        last_trade_time,
        -- Position status
        CASE 
          WHEN market_status = 'closed' AND winning_label IS NOT NULL THEN 'Resolved'
          WHEN net_position_size > 0.0001 THEN 'Open'
          WHEN net_position_size < -0.0001 THEN 'Over-sold'
          ELSE 'Closed'
        END as position_status
      FROM position_summary
      WHERE net_position_size > 0.0001  -- Has open position
        AND (market_status IS NULL OR market_status = 'open' OR market_status != 'closed')
    )

    -- Final output: Open positions only
    SELECT 
      wallet_address,
      market_title,
      token_label,
      position_status,
      market_status,
      ROUND(net_position_size, 4) as net_position_size,
      ROUND(total_cost, 2) as total_cost,
      ROUND(total_proceeds, 2) as total_proceeds,
      ROUND(avg_entry_price, 4) as avg_entry_price,
      total_trades,
      buy_count,
      sell_count,
      first_trade_time,
      last_trade_time,
      ROUND(nfl_pnl_pct, 2) as nfl_pnl_pct,
      ROUND(nfl_win_rate, 2) as nfl_win_rate,
      nfl_trade_count
    FROM open_positions
    ORDER BY wallet_address, market_title, token_label
    """
    
    print("🔍 Running open positions query...", flush=True)
    query_job = client.query(query)
    results = query_job.result()
    
    rows = []
    for row in results:
        rows.append(dict(row))
    
    return rows

def format_currency(value: Optional[float]) -> str:
    """Format value as currency."""
    if value is None:
        return "N/A"
    return f"${value:,.2f}"

def format_percent(value: Optional[float]) -> str:
    """Format value as percentage."""
    if value is None:
        return "N/A"
    return f"{value:.2f}%"

def format_timestamp(ts) -> str:
    """Format timestamp."""
    if ts is None:
        return "N/A"
    if isinstance(ts, (int, float)):
        return datetime.fromtimestamp(ts).strftime('%Y-%m-%d %H:%M')
    return str(ts)

def print_open_positions(rows: List[Dict]):
    """Print formatted open positions."""
    print("\n" + "="*120)
    print("TOP NFL TRADERS - OPEN SUPER BOWL POSITIONS")
    print("="*120)
    print(f"\nAnalysis Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Total Open Positions: {len(rows)}\n")
    
    if not rows:
        print("⚠️  No open Super Bowl positions found for top NFL traders.")
        return
    
    # Group by trader
    by_wallet = {}
    for row in rows:
        wallet = row['wallet_address']
        if wallet not in by_wallet:
            by_wallet[wallet] = []
        by_wallet[wallet].append(row)
    
    # Calculate totals per trader
    trader_totals = {}
    for wallet, positions in by_wallet.items():
        total_cost = sum(p.get('total_cost', 0) or 0 for p in positions)
        total_size = sum(p.get('net_position_size', 0) or 0 for p in positions)
        trader_totals[wallet] = {
            'position_count': len(positions),
            'total_cost': total_cost,
            'total_size': total_size,
            'nfl_pnl_pct': positions[0].get('nfl_pnl_pct'),
            'nfl_win_rate': positions[0].get('nfl_win_rate'),
            'nfl_trade_count': positions[0].get('nfl_trade_count'),
        }
    
    # Print summary
    print("TRADER SUMMARY")
    print("-" * 120)
    print(f"{'Rank':<6} {'Wallet Address':<45} {'NFL PnL%':<12} {'Open Positions':<15} {'Total Invested':<15}")
    print("-" * 120)
    
    sorted_traders = sorted(trader_totals.items(), key=lambda x: x[1]['total_cost'], reverse=True)
    for idx, (wallet, totals) in enumerate(sorted_traders, 1):
        wallet_short = f"{wallet[:6]}...{wallet[-4:]}" if len(wallet) > 10 else wallet
        print(f"{idx:<6} {wallet_short:<45} {format_percent(totals['nfl_pnl_pct']):<12} {totals['position_count']:<15} {format_currency(totals['total_cost']):<15}")
    
    # Print detailed positions
    print("\n" + "="*120)
    print("DETAILED OPEN POSITIONS")
    print("="*120)
    
    for wallet, positions in sorted(by_wallet.items(), key=lambda x: sum(p.get('total_cost', 0) or 0 for p in x[1]), reverse=True):
        wallet_short = f"{wallet[:6]}...{wallet[-4:]}" if len(wallet) > 10 else wallet
        total_cost = sum(p.get('total_cost', 0) or 0 for p in positions)
        
        print(f"\n{wallet_short} ({wallet})")
        print(f"NFL PnL%: {format_percent(positions[0].get('nfl_pnl_pct'))} | NFL Win Rate: {format_percent(positions[0].get('nfl_win_rate'))} | Total Open Value: {format_currency(total_cost)}")
        print("-" * 120)
        print(f"{'Market':<70} {'Outcome':<12} {'Size':<15} {'Cost':<12} {'Entry Price':<12} {'Status':<12}")
        print("-" * 120)
        
        for pos in sorted(positions, key=lambda x: x.get('total_cost', 0) or 0, reverse=True):
            market = pos.get('market_title', 'N/A')
            if len(market) > 68:
                market = market[:65] + "..."
            outcome = pos.get('token_label', 'N/A')
            size = pos.get('net_position_size', 0)
            cost = pos.get('total_cost', 0)
            entry = pos.get('avg_entry_price')
            status = pos.get('market_status', 'unknown')
            
            print(f"{market:<70} {outcome:<12} {size:<15.4f} {format_currency(cost):<12} {format_percent(entry) if entry else 'N/A':<12} {status:<12}")

def main():
    """Main execution."""
    try:
        print("🚀 Starting Open Super Bowl Positions Analysis...", flush=True)
        
        client = get_bigquery_client()
        
        # Run open positions query
        open_positions = run_open_positions_query(client)
        
        # Print results
        print_open_positions(open_positions)
        
        print("\n" + "="*120)
        print("✅ Analysis Complete!")
        print("="*120)
        
    except Exception as e:
        print(f"\n❌ Error running analysis: {e}", flush=True)
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
