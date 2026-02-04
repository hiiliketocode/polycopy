#!/usr/bin/env python3
"""
Analysis: Top 20 NFL Traders - Super Bowl Trading Positions
Purpose: Find top 20 traders by NFL PnL% and analyze their Super Bowl trades
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

def run_trader_summary_query(client: bigquery.Client) -> List[Dict]:
    """Run the main query to get trader summary."""
    query = """
    -- Step 1: Get top 20 traders by NFL PnL% (from trader_profile_stats)
    WITH top_nfl_traders AS (
      SELECT 
        wallet_address,
        L_total_roi_pct as nfl_pnl_pct,
        L_win_rate as nfl_win_rate,
        L_count as nfl_trade_count
      FROM `gen-lang-client-0299056258.polycopy_v1.trader_profile_stats`
      WHERE final_niche = 'NFL'
        AND L_total_roi_pct IS NOT NULL
        AND L_count >= 5  -- Minimum trades to be meaningful
      ORDER BY L_total_roi_pct DESC
      LIMIT 20
    ),

    -- Step 2: Find all markets with "superbowl" tag (case-insensitive)
    superbowl_markets AS (
      SELECT 
        condition_id,
        title,
        status,
        winning_label,
        volume_total
      FROM `gen-lang-client-0299056258.polycopy_v1.markets`
      WHERE (
        -- Check if tags JSON array contains "superbowl" (case-insensitive)
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
        t.tx_hash,
        t.order_hash,
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

    -- Step 5: Calculate PnL for each position
    position_pnl AS (
      SELECT 
        *,
        -- Calculate realized PnL if market is resolved
        CASE 
          WHEN market_status = 'closed' 
            AND winning_label IS NOT NULL
            AND net_position_size > 0.0001  -- Has remaining position
            AND avg_entry_price IS NOT NULL THEN
            CASE 
              WHEN token_label = winning_label THEN 
                -- Win: exit at $1.00, P&L = (1.0 - entry_price) * net_position_size
                (1.0 - avg_entry_price) * net_position_size
              ELSE 
                -- Loss: exit at $0.00, P&L = (0.0 - entry_price) * net_position_size
                (0.0 - avg_entry_price) * net_position_size
            END
          ELSE NULL
        END as realized_pnl,
        -- Position status
        CASE 
          WHEN market_status = 'closed' AND winning_label IS NOT NULL THEN 'Resolved'
          WHEN net_position_size > 0.0001 THEN 'Open'
          WHEN net_position_size < -0.0001 THEN 'Over-sold'
          ELSE 'Closed'
        END as position_status
      FROM position_summary
    ),

    -- Step 6: Aggregate by trader
    trader_summary AS (
      SELECT 
        wallet_address,
        nfl_pnl_pct,
        nfl_win_rate,
        nfl_trade_count,
        COUNT(DISTINCT condition_id) as superbowl_markets_traded,
        COUNT(*) as total_superbowl_positions,
        SUM(total_cost) as total_invested_superbowl,
        SUM(CASE WHEN realized_pnl IS NOT NULL THEN realized_pnl ELSE 0 END) as total_realized_pnl,
        SUM(CASE WHEN position_status = 'Open' THEN total_cost ELSE 0 END) as open_position_value,
        COUNTIF(position_status = 'Resolved' AND realized_pnl > 0) as winning_positions,
        COUNTIF(position_status = 'Resolved' AND realized_pnl <= 0 AND realized_pnl IS NOT NULL) as losing_positions,
        COUNTIF(position_status = 'Open') as open_positions,
        AVG(CASE WHEN realized_pnl IS NOT NULL THEN realized_pnl ELSE NULL END) as avg_position_pnl,
        MAX(CASE WHEN realized_pnl IS NOT NULL THEN realized_pnl ELSE NULL END) as best_position_pnl,
        MIN(CASE WHEN realized_pnl IS NOT NULL THEN realized_pnl ELSE NULL END) as worst_position_pnl
      FROM position_pnl
      GROUP BY 
        wallet_address,
        nfl_pnl_pct,
        nfl_win_rate,
        nfl_trade_count
    )

    -- Final output: Trader summary with Super Bowl analysis
    SELECT 
      wallet_address,
      ROUND(nfl_pnl_pct, 2) as nfl_pnl_pct,
      ROUND(nfl_win_rate, 2) as nfl_win_rate,
      nfl_trade_count,
      superbowl_markets_traded,
      total_superbowl_positions,
      ROUND(total_invested_superbowl, 2) as total_invested_superbowl,
      ROUND(total_realized_pnl, 2) as total_realized_pnl,
      ROUND(open_position_value, 2) as open_position_value,
      ROUND(
        CASE 
          WHEN total_invested_superbowl > 0 THEN 
            (total_realized_pnl / total_invested_superbowl) * 100 
          ELSE NULL 
        END, 
        2
      ) as superbowl_roi_pct,
      winning_positions,
      losing_positions,
      open_positions,
      ROUND(avg_position_pnl, 2) as avg_position_pnl,
      ROUND(best_position_pnl, 2) as best_position_pnl,
      ROUND(worst_position_pnl, 2) as worst_position_pnl,
      ROUND(
        CASE 
          WHEN winning_positions + losing_positions > 0 THEN 
            (winning_positions / (winning_positions + losing_positions)) * 100 
          ELSE NULL 
        END, 
        2
      ) as superbowl_win_rate_pct
    FROM trader_summary
    ORDER BY nfl_pnl_pct DESC
    """
    
    print("🔍 Running trader summary query...", flush=True)
    query_job = client.query(query)
    results = query_job.result()
    
    rows = []
    for row in results:
        rows.append(dict(row))
    
    return rows

def run_position_detail_query(client: bigquery.Client, wallet_addresses: List[str]) -> List[Dict]:
    """Run detailed position breakdown query."""
    if not wallet_addresses:
        return []
    
    wallets_str = "', '".join(wallet_addresses)
    
    query = f"""
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

    -- Step 2: Find all markets with "superbowl" tag
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

    -- Step 3: Get all trades
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
        t.price * t.shares_normalized as trade_value_usd,
        tr.nfl_pnl_pct
      FROM `gen-lang-client-0299056258.polycopy_v1.trades` t
      INNER JOIN top_nfl_traders tr
        ON LOWER(t.wallet_address) = LOWER(tr.wallet_address)
      INNER JOIN superbowl_markets m
        ON t.condition_id = m.condition_id
      WHERE t.price IS NOT NULL
        AND t.shares_normalized IS NOT NULL
        AND LOWER(t.wallet_address) IN ('{wallets_str}')
      ORDER BY t.wallet_address, t.timestamp ASC
    ),

    -- Step 4: Calculate position summaries
    position_summary AS (
      SELECT 
        wallet_address,
        condition_id,
        market_title,
        token_label,
        market_status,
        winning_label,
        nfl_pnl_pct,
        SUM(CASE WHEN side = 'BUY' THEN size ELSE -size END) as net_position_size,
        SUM(CASE WHEN side = 'BUY' THEN trade_value_usd ELSE 0 END) as total_cost,
        SUM(CASE WHEN side = 'SELL' THEN trade_value_usd ELSE 0 END) as total_proceeds,
        CASE 
          WHEN SUM(CASE WHEN side = 'BUY' THEN size ELSE 0 END) > 0 THEN
            SUM(CASE WHEN side = 'BUY' THEN trade_value_usd ELSE 0 END) / 
            SUM(CASE WHEN side = 'BUY' THEN size ELSE 0 END)
          ELSE NULL
        END as avg_entry_price,
        COUNT(*) as total_trades,
        COUNTIF(side = 'BUY') as buy_count,
        COUNTIF(side = 'SELL') as sell_count,
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
        nfl_pnl_pct
    ),

    -- Step 5: Calculate PnL
    position_pnl AS (
      SELECT 
        *,
        CASE 
          WHEN market_status = 'closed' 
            AND winning_label IS NOT NULL
            AND net_position_size > 0.0001
            AND avg_entry_price IS NOT NULL THEN
            CASE 
              WHEN token_label = winning_label THEN 
                (1.0 - avg_entry_price) * net_position_size
              ELSE 
                (0.0 - avg_entry_price) * net_position_size
            END
          ELSE NULL
        END as realized_pnl,
        CASE 
          WHEN market_status = 'closed' AND winning_label IS NOT NULL THEN 'Resolved'
          WHEN net_position_size > 0.0001 THEN 'Open'
          WHEN net_position_size < -0.0001 THEN 'Over-sold'
          ELSE 'Closed'
        END as position_status
      FROM position_summary
    )

    SELECT 
      wallet_address,
      market_title,
      token_label,
      position_status,
      ROUND(net_position_size, 4) as net_position_size,
      ROUND(total_cost, 2) as total_cost,
      ROUND(realized_pnl, 2) as realized_pnl,
      ROUND(avg_entry_price, 4) as avg_entry_price,
      total_trades,
      buy_count,
      sell_count,
      market_status,
      winning_label,
      first_trade_time,
      last_trade_time
    FROM position_pnl
    ORDER BY wallet_address, market_title, token_label
    """
    
    print("🔍 Running detailed position query...", flush=True)
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

def print_trader_summary(rows: List[Dict]):
    """Print formatted trader summary."""
    print("\n" + "="*120)
    print("TOP 20 NFL TRADERS - SUPER BOWL TRADING ANALYSIS")
    print("="*120)
    print(f"\nAnalysis Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Total Traders Analyzed: {len(rows)}\n")
    
    if not rows:
        print("⚠️  No traders found with Super Bowl trades.")
        return
    
    # Print summary table
    print(f"{'Rank':<6} {'Wallet Address':<45} {'NFL PnL%':<12} {'SB Markets':<12} {'SB ROI%':<12} {'SB Win Rate':<12} {'Total Invested':<15}")
    print("-" * 120)
    
    for idx, row in enumerate(rows, 1):
        wallet = row['wallet_address']
        wallet_short = f"{wallet[:6]}...{wallet[-4:]}" if len(wallet) > 10 else wallet
        nfl_pnl = row.get('nfl_pnl_pct', 0)
        sb_markets = row.get('superbowl_markets_traded', 0)
        sb_roi = row.get('superbowl_roi_pct')
        sb_wr = row.get('superbowl_win_rate_pct')
        invested = row.get('total_invested_superbowl', 0)
        
        print(f"{idx:<6} {wallet_short:<45} {format_percent(nfl_pnl):<12} {sb_markets:<12} {format_percent(sb_roi):<12} {format_percent(sb_wr):<12} {format_currency(invested):<15}")
    
    # Print detailed stats
    print("\n" + "="*120)
    print("DETAILED STATISTICS")
    print("="*120)
    
    for idx, row in enumerate(rows, 1):
        wallet = row['wallet_address']
        wallet_short = f"{wallet[:6]}...{wallet[-4:]}" if len(wallet) > 10 else wallet
        
        print(f"\n{idx}. {wallet_short} ({wallet})")
        print(f"   NFL Performance:")
        print(f"     • NFL PnL%: {format_percent(row.get('nfl_pnl_pct'))}")
        print(f"     • NFL Win Rate: {format_percent(row.get('nfl_win_rate'))}")
        print(f"     • NFL Trade Count: {row.get('nfl_trade_count', 0)}")
        print(f"   Super Bowl Performance:")
        print(f"     • Markets Traded: {row.get('superbowl_markets_traded', 0)}")
        print(f"     • Total Positions: {row.get('total_superbowl_positions', 0)}")
        print(f"     • Total Invested: {format_currency(row.get('total_invested_superbowl'))}")
        print(f"     • Realized PnL: {format_currency(row.get('total_realized_pnl'))}")
        print(f"     • Open Position Value: {format_currency(row.get('open_position_value'))}")
        print(f"     • Super Bowl ROI%: {format_percent(row.get('superbowl_roi_pct'))}")
        print(f"     • Super Bowl Win Rate: {format_percent(row.get('superbowl_win_rate_pct'))}")
        print(f"     • Winning Positions: {row.get('winning_positions', 0)}")
        print(f"     • Losing Positions: {row.get('losing_positions', 0)}")
        print(f"     • Open Positions: {row.get('open_positions', 0)}")
        print(f"     • Avg Position PnL: {format_currency(row.get('avg_position_pnl'))}")
        print(f"     • Best Position PnL: {format_currency(row.get('best_position_pnl'))}")
        print(f"     • Worst Position PnL: {format_currency(row.get('worst_position_pnl'))}")

def print_position_details(rows: List[Dict]):
    """Print detailed position breakdown."""
    if not rows:
        return
    
    print("\n" + "="*120)
    print("DETAILED POSITION BREAKDOWN")
    print("="*120)
    
    # Group by wallet
    by_wallet = {}
    for row in rows:
        wallet = row['wallet_address']
        if wallet not in by_wallet:
            by_wallet[wallet] = []
        by_wallet[wallet].append(row)
    
    for wallet, positions in by_wallet.items():
        wallet_short = f"{wallet[:6]}...{wallet[-4:]}" if len(wallet) > 10 else wallet
        print(f"\n{wallet_short} ({wallet})")
        print("-" * 120)
        print(f"{'Market':<60} {'Outcome':<10} {'Status':<12} {'Size':<12} {'Cost':<12} {'PnL':<12} {'Entry Price':<12}")
        print("-" * 120)
        
        for pos in positions:
            market = pos.get('market_title', 'N/A')
            if len(market) > 58:
                market = market[:55] + "..."
            outcome = pos.get('token_label', 'N/A')
            status = pos.get('position_status', 'N/A')
            size = pos.get('net_position_size', 0)
            cost = pos.get('total_cost', 0)
            pnl = pos.get('realized_pnl')
            entry = pos.get('avg_entry_price')
            
            print(f"{market:<60} {outcome:<10} {status:<12} {size:<12.4f} {format_currency(cost):<12} {format_currency(pnl):<12} {format_percent(entry) if entry else 'N/A':<12}")

def main():
    """Main execution."""
    try:
        print("🚀 Starting NFL Traders Super Bowl Analysis...", flush=True)
        
        client = get_bigquery_client()
        
        # Run trader summary query
        trader_summary = run_trader_summary_query(client)
        
        if not trader_summary:
            print("⚠️  No traders found with Super Bowl trades.")
            return
        
        # Print summary
        print_trader_summary(trader_summary)
        
        # Get wallet addresses for detailed query
        wallet_addresses = [row['wallet_address'] for row in trader_summary]
        
        # Run detailed position query
        position_details = run_position_detail_query(client, wallet_addresses)
        
        # Print position details
        print_position_details(position_details)
        
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
