import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  createLiveSimulation,
  getLiveSimulation,
  processLiveTrade,
  resolveLiveMarket,
  getLiveSimulationStatus,
  endLiveSimulation,
  getActiveSimulations,
} from '@/lib/paper-trading/live-manager';
import {
  createPersistentSimulation,
  loadSimulationState,
  processLiveTradeDb,
  resolveLiveMarketDb,
  runHourlyUpdate,
  getSimulationStatus,
  listActiveSimulations as listActiveDbSimulations,
  endSimulation as endDbSimulation,
} from '@/lib/paper-trading/live-manager-db';
import {
  SizingMode,
  StrategyType,
  STRATEGY_CONFIGS,
  getPerformanceMetrics,
  getPortfolioValue,
  generateResults,
} from '@/lib/paper-trading';

// Initialize Supabase for persistent mode
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl || '', supabaseServiceKey || '', {
  auth: { autoRefreshToken: false, persistSession: false },
});

// GET: Get status of a live simulation or list all active simulations
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const simulationId = searchParams.get('id');
  const action = searchParams.get('action') || 'status';
  const mode = searchParams.get('mode') || 'persistent'; // 'persistent' or 'memory'
  
  // List all active simulations
  if (action === 'list' || !simulationId) {
    if (mode === 'persistent') {
      // List from database
      const dbSimulations = await listActiveDbSimulations(supabase);
      return NextResponse.json({
        success: true,
        mode: 'persistent',
        activeSimulations: dbSimulations,
        count: dbSimulations.length,
      });
    } else {
      // List from memory (original behavior)
      const memorySimulations = getActiveSimulations();
      return NextResponse.json({
        success: true,
        mode: 'in-memory',
        activeSimulations: memorySimulations,
        count: memorySimulations.length,
      });
    }
  }
  
  // Try persistent first if mode is persistent
  if (mode === 'persistent') {
    const status = await getSimulationStatus(supabase, simulationId);
    
    if (!status) {
      // Fall back to in-memory
      const memStatus = getLiveSimulationStatus(simulationId);
      if (!memStatus) {
        return NextResponse.json({
          success: false,
          error: 'Simulation not found',
        }, { status: 404 });
      }
      
      return NextResponse.json({
        success: true,
        mode: 'in-memory',
        simulationId,
        ...memStatus,
      });
    }
    
    // Get full state if requested
    if (action === 'full') {
      const state = await loadSimulationState(supabase, simulationId);
      if (!state) {
        return NextResponse.json({
          success: false,
          error: 'Simulation not found',
        }, { status: 404 });
      }
      
      // Build detailed portfolio data
      const portfolios: Record<string, any> = {};
      for (const strategy of state.config.strategies) {
        const portfolio = state.portfolios[strategy];
        const metrics = getPerformanceMetrics(portfolio);
        
        portfolios[strategy] = {
          strategyName: STRATEGY_CONFIGS[strategy].name,
          description: STRATEGY_CONFIGS[strategy].description,
          capital: {
            initial: state.config.initialCapital,
            available: Math.round(portfolio.availableCash * 100) / 100,
            locked: Math.round(portfolio.lockedCapital * 100) / 100,
            cooldown: Math.round(portfolio.cooldownCapital * 100) / 100,
            total: Math.round(metrics.totalValue * 100) / 100,
          },
          performance: {
            totalPnL: Math.round(metrics.totalPnL * 100) / 100,
            roi: Math.round(metrics.totalPnLPercent * 100) / 100,
            winRate: Math.round(metrics.winRate * 100) / 100,
            totalTrades: metrics.totalTrades,
            winningTrades: metrics.winningTrades,
            losingTrades: metrics.losingTrades,
          },
          openPositions: portfolio.openPositions.map(t => ({
            id: t.id,
            market: t.marketTitle.slice(0, 50),
            outcome: t.outcome,
            entryPrice: t.entryPrice,
            invested: t.investedUsd,
            valueScore: t.valueScore,
            aiEdge: t.aiEdge,
            entryTime: new Date(t.entryTimestamp).toISOString(),
          })),
          recentTrades: portfolio.closedPositions.slice(-10).reverse().map(t => ({
            market: t.marketTitle.slice(0, 50),
            outcome: t.outcome,
            status: t.status,
            pnl: t.pnlUsd,
            roi: t.roiPercent,
          })),
          hourlySnapshots: portfolio.hourlySnapshots.slice(-24).map(s => ({
            hour: s.hour,
            value: Math.round(s.portfolioValue * 100) / 100,
            pnl: Math.round(s.cumulativePnl * 100) / 100,
            openPositions: s.openPositions,
          })),
        };
      }
      
      return NextResponse.json({
        success: true,
        mode: 'persistent',
        simulationId,
        status,
        config: {
          mode: state.config.mode,
          initialCapital: state.config.initialCapital,
          slippagePct: state.config.slippagePct,
          cooldownHours: state.config.cooldownHours,
          strategies: state.config.strategies,
          note: 'All strategies use EDGE-BASED position sizing',
        },
        portfolios,
      });
    }
    
    return NextResponse.json({
      success: true,
      mode: 'persistent',
      simulationId,
      ...status,
    });
  }
  
  // In-memory mode (original behavior)
  const status = getLiveSimulationStatus(simulationId);
  if (!status) {
    return NextResponse.json({
      success: false,
      error: 'Simulation not found',
    }, { status: 404 });
  }
  
  // Get full state if requested
  if (action === 'full') {
    const state = getLiveSimulation(simulationId);
    if (!state) {
      return NextResponse.json({
        success: false,
        error: 'Simulation not found',
      }, { status: 404 });
    }
    
    // Build detailed portfolio data
    const portfolios: Record<string, any> = {};
    for (const strategy of state.config.strategies) {
      const portfolio = state.portfolios[strategy];
      const metrics = getPerformanceMetrics(portfolio);
      
      portfolios[strategy] = {
        strategyName: STRATEGY_CONFIGS[strategy].name,
        description: STRATEGY_CONFIGS[strategy].description,
        capital: {
          initial: state.config.initialCapital,
          available: Math.round(portfolio.availableCash * 100) / 100,
          locked: Math.round(portfolio.lockedCapital * 100) / 100,
          cooldown: Math.round(portfolio.cooldownCapital * 100) / 100,
          total: Math.round(metrics.totalValue * 100) / 100,
        },
        performance: {
          totalPnL: Math.round(metrics.totalPnL * 100) / 100,
          roi: Math.round(metrics.totalPnLPercent * 100) / 100,
          winRate: Math.round(metrics.winRate * 100) / 100,
          totalTrades: metrics.totalTrades,
          winningTrades: metrics.winningTrades,
          losingTrades: metrics.losingTrades,
        },
        openPositions: portfolio.openPositions.map(t => ({
          id: t.id,
          market: t.marketTitle.slice(0, 50),
          outcome: t.outcome,
          entryPrice: t.entryPrice,
          invested: t.investedUsd,
          valueScore: t.valueScore,
          entryTime: new Date(t.entryTimestamp).toISOString(),
        })),
        recentTrades: portfolio.closedPositions.slice(-10).reverse().map(t => ({
          market: t.marketTitle.slice(0, 50),
          outcome: t.outcome,
          status: t.status,
          pnl: t.pnlUsd,
          roi: t.roiPercent,
        })),
      };
    }
    
    return NextResponse.json({
      success: true,
      mode: 'in-memory',
      simulationId,
      status,
      config: {
        mode: state.config.mode,
        sizingMode: state.config.sizingMode,
        controlledPositionUsd: state.config.controlledPositionUsd,
        initialCapital: state.config.initialCapital,
        slippagePct: state.config.slippagePct,
        cooldownHours: state.config.cooldownHours,
      },
      portfolios,
      logs: state.logs.slice(-30),
    });
  }
  
  return NextResponse.json({
    success: true,
    mode: 'in-memory',
    simulationId,
    ...status,
  });
}

// POST: Create new simulation or process a trade
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = body.action || 'create';
    
    // Use persistent (database) mode by default, or in-memory if specified
    const usePersistent = body.persistent !== false;
    
    // =========================================================================
    // CREATE: Start a new live simulation
    // =========================================================================
    if (action === 'create') {
      // NOTE: All strategies now use EDGE-BASED position sizing for fair comparison
      // sizingMode and betSize are kept for backward compatibility but are ignored
      const strategies = body.strategies || ['PURE_VALUE_SCORE', 'WEIGHTED_VALUE_SCORE', 'SINGLES_ONLY_V1', 'SINGLES_ONLY_V2'];
      
      if (usePersistent) {
        // Create persistent database-backed simulation
        const result = await createPersistentSimulation(supabase, {
          initialCapital: body.initialCapital || 1000,
          durationDays: body.durationDays || 4,
          slippagePct: body.slippagePct || 0.04,
          cooldownHours: body.cooldownHours || 3,
          strategies,
        });
        
        if (!result.success) {
          return NextResponse.json({
            success: false,
            error: result.error || 'Failed to create simulation',
          }, { status: 500 });
        }
        
        return NextResponse.json({
          success: true,
          action: 'created',
          mode: 'persistent',
          simulationId: result.simulationId,
          config: {
            initialCapital: body.initialCapital || 1000,
            durationDays: body.durationDays || 4,
            strategies,
            note: 'All strategies use EDGE-BASED position sizing for fair comparison',
          },
          message: 'Persistent live simulation started (survives server restarts)',
          webhooks: {
            processTrade: `POST /api/paper-trading/live with action=trade`,
            resolveMarket: `POST /api/paper-trading/live with action=resolve`,
            hourlyUpdate: `POST /api/paper-trading/live with action=hourly`,
          },
        });
      } else {
        // Create in-memory simulation (original behavior)
        const sizingMode = (body.sizingMode || 'controlled') as SizingMode;
        const { simulationId, state } = createLiveSimulation({
          sizingMode,
          controlledPositionUsd: body.betSize || 50,
          initialCapital: body.initialCapital || 1000,
          durationDays: body.durationDays || 4,
          slippagePct: body.slippagePct || 0.04,
          cooldownHours: body.cooldownHours || 3,
          strategies,
        });
        
        return NextResponse.json({
          success: true,
          action: 'created',
          mode: 'in-memory',
          simulationId,
          config: {
            initialCapital: body.initialCapital || 1000,
            strategies,
          },
          message: 'In-memory live simulation started (will be lost on server restart)',
        });
      }
    }
    
    // =========================================================================
    // TRADE: Process a new trade signal
    // Called by fire-feed webhook when a new trade is detected
    // =========================================================================
    if (action === 'trade') {
      const { simulationId, trade, polyScoreData, traderStats } = body;
      
      if (!simulationId) {
        return NextResponse.json({
          success: false,
          error: 'simulationId is required',
        }, { status: 400 });
      }
      
      if (!trade) {
        return NextResponse.json({
          success: false,
          error: 'trade data is required',
        }, { status: 400 });
      }
      
      // Try persistent first, fall back to in-memory
      if (usePersistent) {
        const result = await processLiveTradeDb(supabase, simulationId, trade, polyScoreData, traderStats);
        
        return NextResponse.json({
          success: result.success,
          action: 'trade_processed',
          mode: 'persistent',
          tradesEntered: result.tradesEntered,
          details: result.details,
        });
      } else {
        const result = processLiveTrade(simulationId, trade, polyScoreData, traderStats);
        
        return NextResponse.json({
          success: result.success,
          action: 'trade_processed',
          mode: 'in-memory',
          tradesEntered: result.tradesEntered,
          details: result.details,
        });
      }
    }
    
    // =========================================================================
    // RESOLVE: Mark a market as resolved
    // Called when Polymarket settles a market
    // =========================================================================
    if (action === 'resolve') {
      const { simulationId, conditionId, winningOutcome } = body;
      
      if (!simulationId || !conditionId || !winningOutcome) {
        return NextResponse.json({
          success: false,
          error: 'simulationId, conditionId, and winningOutcome are required',
        }, { status: 400 });
      }
      
      if (usePersistent) {
        const result = await resolveLiveMarketDb(supabase, simulationId, conditionId, winningOutcome);
        
        return NextResponse.json({
          success: result.success,
          action: 'market_resolved',
          mode: 'persistent',
          conditionId,
          winningOutcome,
          positionsResolved: result.positionsResolved,
        });
      } else {
        const result = resolveLiveMarket(simulationId, conditionId, winningOutcome);
        
        return NextResponse.json({
          success: result.success,
          action: 'market_resolved',
          mode: 'in-memory',
          conditionId,
          winningOutcome,
          positionsResolved: result.positionsResolved,
        });
      }
    }
    
    // =========================================================================
    // HOURLY: Periodic update job (for persistent simulations)
    // Call this from a cron job every hour to:
    // - Release capital from cooldown
    // - Record hourly snapshots
    // - Update simulation status
    // =========================================================================
    if (action === 'hourly') {
      const { simulationId } = body;
      
      if (!simulationId) {
        return NextResponse.json({
          success: false,
          error: 'simulationId is required',
        }, { status: 400 });
      }
      
      const result = await runHourlyUpdate(supabase, simulationId);
      
      return NextResponse.json({
        success: result.success,
        action: 'hourly_update',
        hour: result.hour,
        capitalReleased: Math.round(result.capitalReleased * 100) / 100,
        snapshotsRecorded: result.snapshotsRecorded,
      });
    }
    
    // =========================================================================
    // END: End simulation and get final results
    // =========================================================================
    if (action === 'end') {
      const { simulationId } = body;
      
      if (!simulationId) {
        return NextResponse.json({
          success: false,
          error: 'simulationId is required',
        }, { status: 400 });
      }
      
      if (usePersistent) {
        const results = await endDbSimulation(supabase, simulationId);
        
        if (!results) {
          return NextResponse.json({
            success: false,
            error: 'Simulation not found',
          }, { status: 404 });
        }
        
        return NextResponse.json({
          success: true,
          action: 'ended',
          mode: 'persistent',
          simulationId,
          rankings: results.rankings.map((r, i) => ({
            rank: i + 1,
            strategy: r.strategy,
            strategyName: STRATEGY_CONFIGS[r.strategy].name,
            finalValue: Math.round(r.finalValue * 100) / 100,
            totalPnL: Math.round(r.totalPnL * 100) / 100,
            roi: Math.round(r.roi * 100) / 100,
            winRate: Math.round(r.winRate * 100) / 100,
            totalTrades: r.totalTrades,
          })),
          summary: {
            durationMs: results.durationMs,
            totalStrategies: results.config.strategies.length,
          },
        });
      } else {
        const results = endLiveSimulation(simulationId);
        
        if (!results) {
          return NextResponse.json({
            success: false,
            error: 'Simulation not found',
          }, { status: 404 });
        }
        
        return NextResponse.json({
          success: true,
          action: 'ended',
          mode: 'in-memory',
          simulationId,
          rankings: results.rankings,
          summary: {
            durationMs: results.durationMs,
            totalStrategies: results.config.strategies.length,
          },
        });
      }
    }
    
    return NextResponse.json({
      success: false,
      error: `Unknown action: ${action}. Valid actions: create, trade, resolve, hourly, end`,
    }, { status: 400 });
    
  } catch (error: any) {
    console.error('[paper-trading/live] Error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Internal error',
    }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
