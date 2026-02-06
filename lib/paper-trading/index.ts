// Paper Trading Framework
// Auto-trading simulation with 4 strategies
// 
// DESIGN PHILOSOPHY:
// - All strategies use the same EDGE-BASED position sizing
// - Strategies differ ONLY in entry criteria (value score thresholds, etc.)
// - This ensures fair comparison: performance = entry quality, not position sizing luck
// - Backtesting supports multiple time periods for statistical validity
// - Live mode persists to database for durability across restarts

export * from './types';
export * from './strategies';
export * from './portfolio';
export * from './simulation';
export * from './live-manager';
export * from './live-manager-db';
