# PolyCopy MCP Server

Exposes PolyCopy APIs to AI assistants (Cursor, Claude) via [Model Context Protocol](https://modelcontextprotocol.io/).

## Tools

| Tool | Description |
|------|--------------|
| `list_strategies` | List LT strategies with status, capital, PnL, order counts |
| `get_strategy` | Get full detail for a strategy (FT wallet config, risk state) |
| `get_strategy_orders` | Get orders for a strategy (filter by status, limit results) |

## Setup

### 1. Environment variables

Create `.env` in the project root (or set in Cursor config):

```
POLYCOPY_API_URL=https://polycopy.app
CRON_SECRET=your-cron-secret
```

### 2. Cursor configuration

Copy `mcp-server/mcp.json.example` to `.cursor/mcp.json`:

```bash
mkdir -p .cursor
cp mcp-server/mcp.json.example .cursor/mcp.json
```

Edit `.cursor/mcp.json` and replace `YOUR_CRON_SECRET_HERE` with your CRON_SECRET.

Or add via Cursor: Settings → Tools & MCP → Add server, then paste the config from `mcp.json.example`.

### 3. Claude Desktop

For Claude Desktop, add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

See `mcp.json.example` for the config. `cwd` must be the path to the `mcp-server` folder (e.g. `/path/to/PolyCopy/mcp-server` or `mcp-server` if relative to workspace).

## Run manually

```bash
cd /path/to/PolyCopy
POLYCOPY_API_URL=https://polycopy.app CRON_SECRET=xxx npx tsx mcp-server/src/index.ts
```

The server runs on stdio — Cursor/Claude spawns it and communicates via stdin/stdout.

## Auth

The MCP server uses `CRON_SECRET` as a Bearer token when calling PolyCopy APIs. The MCP API routes (`/api/mcp/*`) accept this token and return data for all admin users' strategies.

## Local development

Use `http://localhost:3000` as `POLYCOPY_API_URL` when running the Next.js app locally.
