#!/usr/bin/env npx tsx
/**
 * PolyCopy MCP Server
 *
 * Exposes PolyCopy APIs to AI assistants (Cursor, Claude) via Model Context Protocol.
 *
 * Tools:
 *   - list_strategies: List LT strategies with status, capital, PnL
 *   - get_strategy: Get detail for a strategy
 *   - get_strategy_orders: Get orders for a strategy (place_trade read-only)
 *
 * Requires: POLYCOPY_API_URL, CRON_SECRET in env
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const API_BASE = process.env.POLYCOPY_API_URL || 'http://localhost:3000';
const CRON_SECRET = process.env.CRON_SECRET || '';

async function apiGet(path: string): Promise<unknown> {
  const url = `${API_BASE}${path}`;
  const headers: Record<string, string> = {};
  if (CRON_SECRET) headers['Authorization'] = `Bearer ${CRON_SECRET}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

const server = new Server(
  { name: 'polycopy-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'list_strategies',
      description: 'List LT (live trading) strategies with status, capital, PnL, and order counts',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'get_strategy',
      description: 'Get full detail for a specific LT strategy including FT wallet config',
      inputSchema: {
        type: 'object',
        properties: {
          strategy_id: { type: 'string', description: 'Strategy ID (e.g. LT_xxx)' },
        },
        required: ['strategy_id'],
      },
    },
    {
      name: 'get_strategy_orders',
      description: 'Get orders for a strategy (read-only). Optional: filter by status (PENDING, FILLED, LOST, etc.)',
      inputSchema: {
        type: 'object',
        properties: {
          strategy_id: { type: 'string', description: 'Strategy ID' },
          status: { type: 'string', description: 'Filter by status (optional)' },
          limit: { type: 'number', description: 'Max orders to return (default 50, max 100)' },
        },
        required: ['strategy_id'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const a = (args || {}) as Record<string, unknown>;

  try {
    if (name === 'list_strategies') {
      const data = await apiGet('/api/mcp/strategies');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }

    if (name === 'get_strategy') {
      const strategyId = a?.strategy_id as string;
      if (!strategyId) {
        return { content: [{ type: 'text', text: 'strategy_id required' }], isError: true };
      }
      const data = await apiGet(`/api/mcp/strategies/${encodeURIComponent(strategyId)}`);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }

    if (name === 'get_strategy_orders') {
      const strategyId = a?.strategy_id as string;
      if (!strategyId) {
        return { content: [{ type: 'text', text: 'strategy_id required' }], isError: true };
      }
      const params = new URLSearchParams();
      if (a?.status) params.set('status', String(a.status));
      if (a?.limit) params.set('limit', String(a.limit));
      const qs = params.toString();
      const path = `/api/mcp/strategies/${encodeURIComponent(strategyId)}/orders${qs ? `?${qs}` : ''}`;
      const data = await apiGet(path);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }

    return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: [{ type: 'text', text: `Error: ${msg}` }], isError: true };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('PolyCopy MCP server running on stdio');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
