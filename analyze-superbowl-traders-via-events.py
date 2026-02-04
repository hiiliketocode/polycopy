#!/usr/bin/env python3
"""
Analysis: Super Bowl Traders via Events Table
Purpose: Use the events table to identify Super Bowl traders and find deeper insights
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

def find_superbowl_events(client: bigquery.Client) -> List[Dict]:
    """Find all Super Bowl events in the events table."""
    query = """
    SELECT 
      event_slug,
      title,
      category,
      tags,
      start_time,
      end_time,
      created_at
    FROM `gen-lang-client-0299056258.polycopy_v1.events`
    WHERE (
      LOWER(COALESCE(title, '')) LIKE '%superbowl%'
      OR LOWER(COALESCE(title, '')) LIKE '%super bowl%'
      OR LOWER(COALESCE(event_slug, '')) LIKE '%superbowl%'
      OR LOWER(COALESCE(event_slug, '')) LIKE '%super-bowl%'
      OR (tags IS NOT NULL AND EXISTS (
        SELECT 1 FROM UNNEST(JSON_EXTRACT_ARRAY(tags)) AS tag
        WHERE LOWER(JSON_EXTRACT_SCALAR(tag)) LIKE '%superbowl%'
      ))
    )
    ORDER BY start_time DESC
    """
    
    print("🔍 Finding Super Bowl events...", flush=True)
    query_job = client.query(query)
    results = query_job.result()
    
    rows = []
    for row in results:
        rows.append(dict(row))
    
    return rows

def analyze_traders_by_event(client: bigquery.Client, event_slugs: List[str]) -> List[Dict]:
    """Analyze traders who traded on Super Bowl events."""
    if not event_slugs:
        return []
    
    # Create event slug filter
    event_filter = "', '".join(event_slugs)
    
    query = f"""
    -- Step 1: Find all markets for Super Bowl events
    WITH superbowl_markets AS (
      SELECT DISTINCT
        condition_id,
        title,
        event_slug,
        status,
        winning_label,
        volume_total
      FROM `gen-lang-client-0299056258.polycopy_v1.markets`
      WHERE event_slug IN ('{event_filter}')
    ),
    
    -- Step 2: Get all trades on these markets
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
        m.event_slug,
        m.status as market_status,
        m.winning_label,
        m.volume_total,
        t.price * t.shares_normalized as trade_value_usd
      FROM `gen-lang-client-0299056258.polycopy_v1.trades` t
      INNER JOIN superbowl_markets m
        ON t.condition_id = m.condition_id
      WHERE t.price IS NOT NULL
        AND t.shares_normalized IS NOT NULL
    ),
    
    -- Step 3: Get trader NFL stats
    trader_nfl_stats AS (
      SELECT 
        wallet_address,
        L_total_roi_pct as nfl_pnl_pct,
        L_win_rate as nfl_win_rate,
        L_count as nfl_trade_count
      FROM `gen-lang-client-0299056258.polycopy_v1.trader_profile_stats`
      WHERE final_niche = 'NFL'
        AND L_total_roi_pct IS NOT NULL
    ),
    
    -- Step 4: Calculate position summaries per trader per market
    position_summary AS (
      SELECT 
        t.wallet_address,
        t.condition_id,
        t.market_title,
        t.event_slug,
        t.token_label,
        t.market_status,
        t.winning_label,
        t.volume_total,
        COALESCE(s.nfl_pnl_pct, 0) as nfl_pnl_pct,
        COALESCE(s.nfl_win_rate, 0) as nfl_win_rate,
        COALESCE(s.nfl_trade_count, 0) as nfl_trade_count,
        -- Net position size (BUYs - SELLs)
        SUM(CASE WHEN t.side = 'BUY' THEN t.size ELSE -t.size END) as net_position_size,
        -- Total cost basis (from BUYs only)
        SUM(CASE WHEN t.side = 'BUY' THEN t.trade_value_usd ELSE 0 END) as total_cost,
        -- Total proceeds (from SELLs only)
        SUM(CASE WHEN t.side = 'SELL' THEN t.trade_value_usd ELSE 0 END) as total_proceeds,
        -- Average entry price
        CASE 
          WHEN SUM(CASE WHEN t.side = 'BUY' THEN t.size ELSE 0 END) > 0 THEN
            SUM(CASE WHEN t.side = 'BUY' THEN t.trade_value_usd ELSE 0 END) / 
            SUM(CASE WHEN t.side = 'BUY' THEN t.size ELSE 0 END)
          ELSE NULL
        END as avg_entry_price,
        COUNT(*) as total_trades,
        COUNTIF(t.side = 'BUY') as buy_count,
        COUNTIF(t.side = 'SELL') as sell_count,
        MIN(t.timestamp) as first_trade_time,
        MAX(t.timestamp) as last_trade_time
      FROM superbowl_trades t
      LEFT JOIN trader_nfl_stats s
        ON LOWER(t.wallet_address) = LOWER(s.wallet_address)
      GROUP BY 
        t.wallet_address,
        t.condition_id,
        t.market_title,
        t.event_slug,
        t.token_label,
        t.market_status,
        t.winning_label,
        t.volume_total,
        s.nfl_pnl_pct,
        s.nfl_win_rate,
        s.nfl_trade_count
    ),
    
    -- Step 5: Calculate PnL for each position
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
    ),
    
    -- Step 6: Aggregate by trader
    trader_summary AS (
      SELECT 
        wallet_address,
        MAX(nfl_pnl_pct) as nfl_pnl_pct,
        MAX(nfl_win_rate) as nfl_win_rate,
        MAX(nfl_trade_count) as nfl_trade_count,
        COUNT(DISTINCT event_slug) as superbowl_events_traded,
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
        MIN(CASE WHEN realized_pnl IS NOT NULL THEN realized_pnl ELSE NULL END) as worst_position_pnl,
        -- Event-specific metrics
        STRING_AGG(DISTINCT event_slug, ', ' ORDER BY event_slug) as events_list
      FROM position_pnl
      GROUP BY wallet_address
    )
    
    SELECT 
      wallet_address,
      ROUND(nfl_pnl_pct, 2) as nfl_pnl_pct,
      ROUND(nfl_win_rate, 2) as nfl_win_rate,
      nfl_trade_count,
      superbowl_events_traded,
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
      ) as superbowl_win_rate_pct,
      events_list
    FROM trader_summary
    ORDER BY total_invested_superbowl DESC
    """
    
    print("🔍 Analyzing traders by Super Bowl events...", flush=True)
    query_job = client.query(query)
    results = query_job.result()
    
    rows = []
    for row in results:
        rows.append(dict(row))
    
    return rows

def analyze_event_details(client: bigquery.Client, event_slugs: List[str]) -> List[Dict]:
    """Get detailed information about Super Bowl events and their markets."""
    if not event_slugs:
        return []
    
    event_filter = "', '".join(event_slugs)
    
    query = f"""
    SELECT 
      e.event_slug,
      e.title as event_title,
      e.category,
      e.start_time,
      e.end_time,
      COUNT(DISTINCT m.condition_id) as market_count,
      SUM(m.volume_total) as total_volume,
      COUNT(DISTINCT t.wallet_address) as unique_traders,
      COUNT(*) as total_trades,
      SUM(t.price * t.shares_normalized) as total_trade_value
    FROM `gen-lang-client-0299056258.polycopy_v1.events` e
    LEFT JOIN `gen-lang-client-0299056258.polycopy_v1.markets` m
      ON e.event_slug = m.event_slug
    LEFT JOIN `gen-lang-client-0299056258.polycopy_v1.trades` t
      ON m.condition_id = t.condition_id
    WHERE e.event_slug IN ('{event_filter}')
    GROUP BY 
      e.event_slug,
      e.title,
      e.category,
      e.start_time,
      e.end_time
    ORDER BY e.start_time DESC
    """
    
    print("🔍 Getting event details...", flush=True)
    query_job = client.query(query)
    results = query_job.result()
    
    rows = []
    for row in results:
        rows.append(dict(row))
    
    return rows

def format_currency(value: Optional[float]) -> str:
    """Format value as currency."""
    if value is None or value == 0:
        return "$0.00"
    return f"${value:,.2f}"

def format_percent(value: Optional[float]) -> str:
    """Format value as percentage."""
    if value is None:
        return "N/A"
    return f"{value:.2f}%"

def print_events(events: List[Dict]):
    """Print Super Bowl events found."""
    print("\n" + "="*120)
    print("SUPER BOWL EVENTS FOUND")
    print("="*120)
    
    if not events:
        print("⚠️  No Super Bowl events found in events table.")
        return
    
    print(f"\nFound {len(events)} Super Bowl event(s):\n")
    for idx, event in enumerate(events, 1):
        print(f"{idx}. {event.get('event_slug', 'N/A')}")
        print(f"   Title: {event.get('title', 'N/A')}")
        print(f"   Category: {event.get('category', 'N/A')}")
        print(f"   Start Time: {event.get('start_time', 'N/A')}")
        print(f"   End Time: {event.get('end_time', 'N/A')}")
        print()

def print_event_details(event_details: List[Dict]):
    """Print detailed event statistics."""
    print("\n" + "="*120)
    print("SUPER BOWL EVENT STATISTICS")
    print("="*120)
    
    if not event_details:
        return
    
    print(f"\n{'Event Slug':<40} {'Markets':<10} {'Traders':<10} {'Trades':<12} {'Volume':<15} {'Trade Value':<15}")
    print("-" * 120)
    
    for event in event_details:
        slug = event.get('event_slug', 'N/A')
        if len(slug) > 38:
            slug = slug[:35] + "..."
        print(f"{slug:<40} {event.get('market_count', 0):<10} {event.get('unique_traders', 0):<10} {event.get('total_trades', 0):<12} {format_currency(event.get('total_volume')):<15} {format_currency(event.get('total_trade_value')):<15}")

def print_trader_analysis(traders: List[Dict]):
    """Print trader analysis."""
    print("\n" + "="*120)
    print("SUPER BOWL TRADERS ANALYSIS (via Events Table)")
    print("="*120)
    print(f"\nAnalysis Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Total Traders Found: {len(traders)}\n")
    
    if not traders:
        print("⚠️  No traders found trading Super Bowl events.")
        return
    
    # Summary table
    print(f"{'Rank':<6} {'Wallet Address':<45} {'NFL PnL%':<12} {'Events':<8} {'Markets':<8} {'SB ROI%':<12} {'Invested':<15}")
    print("-" * 120)
    
    for idx, trader in enumerate(traders[:20], 1):  # Top 20
        wallet = trader['wallet_address']
        wallet_short = f"{wallet[:6]}...{wallet[-4:]}" if len(wallet) > 10 else wallet
        nfl_pnl = trader.get('nfl_pnl_pct', 0)
        events = trader.get('superbowl_events_traded', 0)
        markets = trader.get('superbowl_markets_traded', 0)
        sb_roi = trader.get('superbowl_roi_pct')
        invested = trader.get('total_invested_superbowl', 0)
        
        print(f"{idx:<6} {wallet_short:<45} {format_percent(nfl_pnl):<12} {events:<8} {markets:<8} {format_percent(sb_roi):<12} {format_currency(invested):<15}")
    
    # Detailed stats
    print("\n" + "="*120)
    print("DETAILED TRADER STATISTICS")
    print("="*120)
    
    for idx, trader in enumerate(traders[:10], 1):  # Top 10 detailed
        wallet = trader['wallet_address']
        wallet_short = f"{wallet[:6]}...{wallet[-4:]}" if len(wallet) > 10 else wallet
        
        print(f"\n{idx}. {wallet_short} ({wallet})")
        print(f"   NFL Performance:")
        print(f"     • NFL PnL%: {format_percent(trader.get('nfl_pnl_pct'))}")
        print(f"     • NFL Win Rate: {format_percent(trader.get('nfl_win_rate'))}")
        print(f"     • NFL Trade Count: {trader.get('nfl_trade_count', 0)}")
        print(f"   Super Bowl Performance:")
        print(f"     • Events Traded: {trader.get('superbowl_events_traded', 0)}")
        print(f"     • Markets Traded: {trader.get('superbowl_markets_traded', 0)}")
        print(f"     • Total Positions: {trader.get('total_superbowl_positions', 0)}")
        print(f"     • Total Invested: {format_currency(trader.get('total_invested_superbowl'))}")
        print(f"     • Realized PnL: {format_currency(trader.get('total_realized_pnl'))}")
        print(f"     • Open Position Value: {format_currency(trader.get('open_position_value'))}")
        print(f"     • Super Bowl ROI%: {format_percent(trader.get('superbowl_roi_pct'))}")
        print(f"     • Super Bowl Win Rate: {format_percent(trader.get('superbowl_win_rate_pct'))}")
        print(f"     • Winning Positions: {trader.get('winning_positions', 0)}")
        print(f"     • Losing Positions: {trader.get('losing_positions', 0)}")
        print(f"     • Open Positions: {trader.get('open_positions', 0)}")
        print(f"     • Avg Position PnL: {format_currency(trader.get('avg_position_pnl'))}")
        print(f"     • Best Position PnL: {format_currency(trader.get('best_position_pnl'))}")
        print(f"     • Worst Position PnL: {format_currency(trader.get('worst_position_pnl'))}")
        print(f"     • Events: {trader.get('events_list', 'N/A')}")

def main():
    """Main execution."""
    try:
        print("🚀 Starting Super Bowl Traders Analysis via Events Table...", flush=True)
        
        client = get_bigquery_client()
        
        # Step 1: Find Super Bowl events
        events = find_superbowl_events(client)
        print_events(events)
        
        if not events:
            print("\n⚠️  No Super Bowl events found. Analysis cannot continue.")
            return
        
        event_slugs = [e['event_slug'] for e in events if e.get('event_slug')]
        
        # Step 2: Get event details
        event_details = analyze_event_details(client, event_slugs)
        print_event_details(event_details)
        
        # Step 3: Analyze traders
        traders = analyze_traders_by_event(client, event_slugs)
        print_trader_analysis(traders)
        
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
