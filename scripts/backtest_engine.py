#!/usr/bin/env python3
"""
PolyCopy Backtesting Engine

A clean, auditable backtesting system using point-in-time data.

Usage:
    python scripts/backtest_engine.py --help
    python scripts/backtest_engine.py --strategy FOLLOW_WINNERS --start 2025-01-01 --end 2025-06-30

Features:
    - Uses point-in-time trader stats (no look-ahead bias)
    - Applies realistic slippage
    - Full audit trail of every decision
    - Standard performance metrics
"""

import argparse
import json
import uuid
from datetime import datetime, date
from dataclasses import dataclass, asdict
from typing import Optional, List, Dict, Any
import math

from google.cloud import bigquery

# Configuration
PROJECT_ID = "gen-lang-client-0299056258"
DATASET = "polycopy_v1"


@dataclass
class BacktestConfig:
    """Configuration for a backtest run."""
    strategy_type: str
    start_date: str  # YYYY-MM-DD
    end_date: str    # YYYY-MM-DD
    initial_capital: float = 1000.0
    slippage_pct: float = 0.04  # 4% default
    min_confidence: str = "MEDIUM"  # HIGH, MEDIUM, LOW, INSUFFICIENT
    min_win_rate: float = 0.55  # Minimum trader win rate to follow
    min_resolved_trades: int = 30  # Minimum history
    min_edge_pct: float = 0.05  # Minimum edge (win_rate - entry_price)
    position_size_pct: float = 0.05  # 5% of capital per trade
    max_position_usd: float = 100.0
    max_trades_per_day: int = 10  # Realistic daily limit
    description: str = ""


@dataclass
class TradeDecision:
    """A single trade decision."""
    trade_time: datetime
    wallet_address: str
    condition_id: str
    token_label: str
    decision: str = "PENDING"  # ENTER, SKIP, PENDING
    skip_reason: Optional[str] = None
    entry_price: Optional[float] = None
    position_size_usd: Optional[float] = None
    effective_entry_price: Optional[float] = None
    trader_win_rate: Optional[float] = None
    trader_resolved_trades: Optional[int] = None
    stat_confidence: Optional[str] = None
    outcome: Optional[str] = None
    pnl_usd: Optional[float] = None


@dataclass
class BacktestResult:
    """Results from a backtest run."""
    run_id: str
    config: BacktestConfig
    total_trades: int
    winning_trades: int
    losing_trades: int
    skipped_trades: int
    total_return_pct: float
    final_capital: float
    win_rate: float
    avg_win_usd: float
    avg_loss_usd: float
    profit_factor: float
    max_drawdown_pct: float
    sharpe_ratio: float


class BacktestEngine:
    """Core backtesting engine."""
    
    def __init__(self, config: BacktestConfig):
        self.config = config
        self.client = bigquery.Client(project=PROJECT_ID)
        self.run_id = f"bt_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}"
        
        # State
        self.capital = config.initial_capital
        self.peak_capital = config.initial_capital
        self.max_drawdown = 0.0
        self.trades: List[TradeDecision] = []
        self.daily_returns: List[float] = []
        
        # Daily tracking
        self.current_day: Optional[date] = None
        self.trades_today: int = 0
        
    def run(self) -> BacktestResult:
        """Execute the backtest."""
        print(f"\n{'='*60}")
        print(f"BACKTEST: {self.run_id}")
        print(f"{'='*60}")
        print(f"Strategy: {self.config.strategy_type}")
        print(f"Period: {self.config.start_date} to {self.config.end_date}")
        print(f"Capital: ${self.config.initial_capital:,.2f}")
        print(f"Slippage: {self.config.slippage_pct*100:.1f}%")
        print(f"{'='*60}\n")
        
        # Record run start
        self._record_run_start()
        
        # Fetch trades in period
        trades_df = self._fetch_trades()
        total_candidates = len(trades_df)
        print(f"Found {total_candidates:,} trade candidates in period\n")
        
        # Process each trade
        for idx, row in enumerate(trades_df):
            if idx % 10000 == 0 and idx > 0:
                print(f"Processed {idx:,}/{total_candidates:,} trades...")
            
            decision = self._evaluate_trade(row)
            self.trades.append(decision)
            
            if decision.decision == "ENTER":
                self._execute_trade(decision, row)
        
        # Calculate final metrics
        result = self._calculate_results()
        
        # Record to BigQuery
        self._record_results(result)
        
        return result
    
    def _fetch_trades(self) -> List[Dict]:
        """Fetch trades that meet strategy criteria (pre-filtered in BigQuery for speed)."""
        
        # Map confidence to filter
        conf_filter = {
            'HIGH': "stat_confidence = 'HIGH'",
            'MEDIUM': "stat_confidence IN ('HIGH', 'MEDIUM')",
            'LOW': "stat_confidence IN ('HIGH', 'MEDIUM', 'LOW')",
            'INSUFFICIENT': "1=1"  # All
        }.get(self.config.min_confidence, "stat_confidence IN ('HIGH', 'MEDIUM')")
        
        query = f"""
        SELECT 
            trade_time,
            wallet_address,
            condition_id,
            token_label,
            entry_price,
            trade_size_usd,
            L_win_rate,
            L_resolved_count,
            stat_confidence,
            outcome,
            winning_label,
            -- Calculate edge: win_rate - entry_price
            L_win_rate - entry_price as edge
        FROM `{PROJECT_ID}.{DATASET}.trader_stats_at_trade`
        WHERE trade_time >= '{self.config.start_date}'
          AND trade_time < '{self.config.end_date}'
          AND {conf_filter}
          AND L_resolved_count >= {self.config.min_resolved_trades}
          AND L_win_rate >= {self.config.min_win_rate}
          AND (L_win_rate - entry_price) >= {self.config.min_edge_pct}  -- Only +EV trades
        ORDER BY trade_time
        """
        
        result = self.client.query(query).result()
        return [dict(row) for row in result]
    
    def _evaluate_trade(self, row: Dict) -> TradeDecision:
        """Evaluate whether to enter a trade.
        
        Note: Most filtering is done in BigQuery for performance.
        This function handles remaining logic (capital checks, position sizing, daily limits).
        """
        trade_date = row['trade_time'].date()
        
        # Track daily limits
        if trade_date != self.current_day:
            self.current_day = trade_date
            self.trades_today = 0
        
        decision = TradeDecision(
            trade_time=row['trade_time'],
            wallet_address=row['wallet_address'],
            condition_id=row['condition_id'],
            token_label=row['token_label'],
            trader_win_rate=row['L_win_rate'],
            trader_resolved_trades=row['L_resolved_count'],
            stat_confidence=row['stat_confidence'],
            entry_price=row['entry_price'],
            outcome=row['outcome']
        )
        
        # Check daily trade limit
        if self.trades_today >= self.config.max_trades_per_day:
            decision.decision = "SKIP"
            decision.skip_reason = "Daily trade limit reached"
            return decision
        
        # Check capital
        position_size = min(
            self.capital * self.config.position_size_pct,
            self.config.max_position_usd
        )
        
        if position_size < 1.0:  # Minimum $1 trade
            decision.decision = "SKIP"
            decision.skip_reason = "Insufficient capital"
            return decision
        
        # Enter the trade
        decision.decision = "ENTER"
        decision.position_size_usd = position_size
        self.trades_today += 1
        
        # Apply slippage to entry price
        effective_price = row['entry_price'] * (1 + self.config.slippage_pct)
        decision.effective_entry_price = min(effective_price, 0.99)  # Cap at 99c
        
        return decision
    
    def _execute_trade(self, decision: TradeDecision, row: Dict):
        """Execute a trade and update capital."""
        # Calculate P&L
        if decision.outcome == "WON":
            # Win: receive $1 per share, minus entry cost
            pnl = decision.position_size_usd * (1.0 / decision.effective_entry_price - 1.0)
        else:
            # Loss: lose entry cost
            pnl = -decision.position_size_usd
        
        decision.pnl_usd = pnl
        
        # Update capital
        self.capital += pnl
        
        # Track peak and drawdown
        if self.capital > self.peak_capital:
            self.peak_capital = self.capital
        
        current_drawdown = (self.peak_capital - self.capital) / self.peak_capital
        if current_drawdown > self.max_drawdown:
            self.max_drawdown = current_drawdown
    
    def _calculate_results(self) -> BacktestResult:
        """Calculate final performance metrics."""
        entered_trades = [t for t in self.trades if t.decision == "ENTER"]
        winning_trades = [t for t in entered_trades if t.outcome == "WON"]
        losing_trades = [t for t in entered_trades if t.outcome == "LOST"]
        skipped_trades = [t for t in self.trades if t.decision == "SKIP"]
        
        total_entered = len(entered_trades)
        total_wins = len(winning_trades)
        total_losses = len(losing_trades)
        
        # Win rate
        win_rate = total_wins / total_entered if total_entered > 0 else 0
        
        # Average win/loss
        avg_win = sum(t.pnl_usd for t in winning_trades) / total_wins if total_wins > 0 else 0
        avg_loss = sum(t.pnl_usd for t in losing_trades) / total_losses if total_losses > 0 else 0
        
        # Profit factor
        gross_wins = sum(t.pnl_usd for t in winning_trades)
        gross_losses = abs(sum(t.pnl_usd for t in losing_trades))
        profit_factor = gross_wins / gross_losses if gross_losses > 0 else float('inf')
        
        # Total return
        total_return_pct = (self.capital - self.config.initial_capital) / self.config.initial_capital * 100
        
        # Sharpe ratio (simplified - annualized)
        if entered_trades:
            returns = [t.pnl_usd / self.config.initial_capital for t in entered_trades]
            avg_return = sum(returns) / len(returns)
            std_return = math.sqrt(sum((r - avg_return)**2 for r in returns) / len(returns)) if len(returns) > 1 else 0
            sharpe = (avg_return / std_return) * math.sqrt(252) if std_return > 0 else 0  # Annualized
        else:
            sharpe = 0
        
        return BacktestResult(
            run_id=self.run_id,
            config=self.config,
            total_trades=total_entered,
            winning_trades=total_wins,
            losing_trades=total_losses,
            skipped_trades=len(skipped_trades),
            total_return_pct=total_return_pct,
            final_capital=self.capital,
            win_rate=win_rate,
            avg_win_usd=avg_win,
            avg_loss_usd=avg_loss,
            profit_factor=profit_factor,
            max_drawdown_pct=self.max_drawdown * 100,
            sharpe_ratio=sharpe
        )
    
    def _record_run_start(self):
        """Record backtest start in BigQuery."""
        query = f"""
        INSERT INTO `{PROJECT_ID}.{DATASET}.backtest_runs`
        (run_id, run_name, created_by, description, strategy_type, strategy_version,
         config, start_date, end_date, initial_capital, slippage_pct, status, started_at)
        VALUES (
            '{self.run_id}',
            '{self.config.strategy_type}_{self.config.start_date}_{self.config.end_date}',
            'backtest_engine',
            '{self.config.description}',
            '{self.config.strategy_type}',
            'v1',
            JSON '{json.dumps(asdict(self.config))}',
            '{self.config.start_date}',
            '{self.config.end_date}',
            {self.config.initial_capital},
            {self.config.slippage_pct},
            'running',
            CURRENT_TIMESTAMP()
        )
        """
        self.client.query(query).result()
    
    def _record_results(self, result: BacktestResult):
        """Record final results to BigQuery."""
        # Update run status
        query = f"""
        UPDATE `{PROJECT_ID}.{DATASET}.backtest_runs`
        SET 
            status = 'completed',
            completed_at = CURRENT_TIMESTAMP(),
            total_trades = {result.total_trades},
            winning_trades = {result.winning_trades},
            total_return_pct = {result.total_return_pct},
            sharpe_ratio = {result.sharpe_ratio},
            max_drawdown_pct = {result.max_drawdown_pct},
            final_capital = {result.final_capital}
        WHERE run_id = '{self.run_id}'
        """
        self.client.query(query).result()
        
        # Record individual trades (sample for large backtests)
        entered_trades = [t for t in self.trades if t.decision == "ENTER"]
        
        # For large backtests, only record a sample
        if len(entered_trades) > 5000:
            print(f"Note: Sampling trades for storage ({len(entered_trades)} -> 5000)")
            # Sample evenly distributed trades
            step = len(entered_trades) // 5000
            entered_trades = entered_trades[::step][:5000]
        
        if entered_trades:
            rows = []
            for seq, trade in enumerate(entered_trades):
                rows.append({
                    "run_id": self.run_id,
                    "trade_seq": seq,
                    "trade_time": trade.trade_time.isoformat(),
                    "wallet_address": trade.wallet_address,
                    "condition_id": trade.condition_id,
                    "token_label": trade.token_label,
                    "decision": trade.decision,
                    "entry_price": trade.entry_price,
                    "position_size_usd": trade.position_size_usd,
                    "effective_entry_price": trade.effective_entry_price,
                    "trader_win_rate": trade.trader_win_rate,
                    "trader_resolved_trades": trade.trader_resolved_trades,
                    "stat_confidence": trade.stat_confidence,
                    "outcome": trade.outcome,
                    "pnl_usd": trade.pnl_usd
                })
            
            # Insert in batches of 500
            table_ref = f"{PROJECT_ID}.{DATASET}.backtest_trades"
            batch_size = 500
            for i in range(0, len(rows), batch_size):
                batch = rows[i:i+batch_size]
                errors = self.client.insert_rows_json(table_ref, batch)
                if errors:
                    print(f"Warning: Some trade records failed to insert: {errors[:3]}")


def print_results(result: BacktestResult):
    """Print backtest results."""
    print(f"\n{'='*60}")
    print("BACKTEST RESULTS")
    print(f"{'='*60}")
    print(f"Run ID: {result.run_id}")
    print(f"\n📊 PERFORMANCE:")
    print(f"   Total Return: {result.total_return_pct:+.2f}%")
    print(f"   Final Capital: ${result.final_capital:,.2f}")
    print(f"   Max Drawdown: {result.max_drawdown_pct:.2f}%")
    print(f"   Sharpe Ratio: {result.sharpe_ratio:.2f}")
    
    print(f"\n📈 TRADES:")
    print(f"   Total Entered: {result.total_trades:,}")
    print(f"   Winners: {result.winning_trades:,}")
    print(f"   Losers: {result.losing_trades:,}")
    print(f"   Skipped: {result.skipped_trades:,}")
    print(f"   Win Rate: {result.win_rate:.1%}")
    
    print(f"\n💰 P&L:")
    print(f"   Avg Win: ${result.avg_win_usd:.2f}")
    print(f"   Avg Loss: ${result.avg_loss_usd:.2f}")
    print(f"   Profit Factor: {result.profit_factor:.2f}")
    
    print(f"\n{'='*60}\n")


def main():
    parser = argparse.ArgumentParser(description="PolyCopy Backtesting Engine")
    parser.add_argument("--strategy", type=str, default="FOLLOW_WINNERS",
                       help="Strategy type (default: FOLLOW_WINNERS)")
    parser.add_argument("--start", type=str, required=True,
                       help="Start date (YYYY-MM-DD)")
    parser.add_argument("--end", type=str, required=True,
                       help="End date (YYYY-MM-DD)")
    parser.add_argument("--capital", type=float, default=1000.0,
                       help="Initial capital (default: 1000)")
    parser.add_argument("--slippage", type=float, default=0.04,
                       help="Slippage percentage (default: 0.04)")
    parser.add_argument("--min-win-rate", type=float, default=0.55,
                       help="Minimum trader win rate (default: 0.55)")
    parser.add_argument("--min-trades", type=int, default=30,
                       help="Minimum resolved trades (default: 30)")
    parser.add_argument("--min-edge", type=float, default=0.05,
                       help="Minimum edge: win_rate - entry_price (default: 0.05)")
    parser.add_argument("--description", type=str, default="",
                       help="Description of this backtest")
    
    args = parser.parse_args()
    
    config = BacktestConfig(
        strategy_type=args.strategy,
        start_date=args.start,
        end_date=args.end,
        initial_capital=args.capital,
        slippage_pct=args.slippage,
        min_win_rate=args.min_win_rate,
        min_resolved_trades=args.min_trades,
        min_edge_pct=args.min_edge,
        description=args.description
    )
    
    engine = BacktestEngine(config)
    result = engine.run()
    print_results(result)


if __name__ == "__main__":
    main()
