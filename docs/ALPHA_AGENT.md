# Alpha Agent: Autonomous AI Trading Strategist

## What Is It?

Alpha Agent is an AI system that manages its own trading bots on our platform. It watches every bot in our fleet, figures out what's winning and why, builds its own strategies, tests hypotheses, and continuously improves — all autonomously.

Think of it as hiring a quant trader who works 24/7, never sleeps, remembers everything, and gets smarter with every trade.

---

## How It Works

### The Agent Loop (daily at 6 AM UTC)

```
  OBSERVE  →  REMEMBER  →  ANALYZE  →  DECIDE  →  ACT  →  REFLECT
     ↑                                                        |
     └────────────────── learns from outcomes ─────────────────┘
```

1. **Observe** — Pulls performance data from all 66+ bots. Win rates, ROI, profit factors, price bands, time-to-resolution, trader quality, allocation methods.

2. **Remember** — Retrieves relevant knowledge from its 3-tier memory system. Checks what it tried before and what happened.

3. **Analyze** — Gemini 2.5 Pro ingests all the data and finds patterns. Why is bot X winning? Why did strategy Y fail? What price bands are profitable right now?

4. **Decide** — Generates specific strategy changes with full reasoning chains. Every decision has a hypothesis, expected outcome, and confidence score.

5. **Act** — Applies changes to its own 3 FT wallets (within safety boundaries — it can't blow things up).

6. **Reflect** — Honestly assesses its own performance. Were past decisions correct? What biases should it correct? This reflection is saved as memory for next time.

---

## The Three Bots

| Bot | Role | Risk Profile |
|-----|------|-------------|
| **Explorer** | Tests new hypotheses aggressively | High risk, high learning. Rotates strategies to discover new edges. |
| **Optimizer** | Refines proven winners | Moderate risk. Takes winning patterns and fine-tunes parameters. |
| **Conservative** | Deploys proven edge only | Low risk. Maximum Sharpe ratio. Only highest-conviction setups. |

The Explorer discovers, the Optimizer refines, the Conservative deploys. New patterns flow from left to right as they're validated.

---

## Key Capabilities

### Deep ML Model Understanding
The agent deeply understands our `poly_predictor_v11` model — all 34 features across 11 categories, the PnL-weighted training method, recency decay (λ=0.007), and what each feature means for trading decisions. It uses this knowledge to set model thresholds intelligently.

### Selling & Exit Strategies
Not just entries — the agent designs exit strategies:
- Stop loss / take profit
- Time-based exits (capital efficiency)
- Edge decay detection
- Resolution proximity management
- Trader exit following
- Can invent entirely new exit types

### BigQuery Access (Read-Only)
The agent can query our 84M+ trade history, 46M trader statistics, and model predictions directly. It can investigate patterns, validate hypotheses, and discover edges that aren't visible in the FT data alone. Safety guardrails prevent any writes or model training.

### Recursive Self-Improvement
Every run, the agent identifies its own blind spots, proposes new analysis techniques, and evolves its capabilities. It tracks what kinds of decisions lead to good outcomes and adjusts its approach.

### Structured Memory
The agent stores data tables, calculations, and forecasts in its memory — not just text. It can track hypothesis outcomes over time, run parameter sweeps, and build up quantitative knowledge.

---

## The Command Center (`/alpha-agent`)

A single page where you can:

- **Chat with the agent** about all 3 bots — ask about performance, decisions, patterns, the ML model, anything
- **Watch runs** — see every 30-minute cycle with observations, patterns found, decisions made, and reflections
- **Browse memory** — see the agent's growing knowledge base (short-term observations, mid-term patterns, long-term lessons)
- **Read reflections** — the agent's honest self-assessments

Each bot also has its own detail page (`/alpha-agent/ALPHA_EXPLORER` etc.) with full trade tables, decision history, and per-bot chat — same format as our existing FT/LT detail pages.

### First Launch

Click **"Launch Agent"** and it:
1. Analyzes the entire existing bot fleet
2. Identifies what's working and why
3. Designs initial strategies for all 3 bots
4. Explains its reasoning in the chat

---

## Architecture

### Models (Multi-Model)

| Role | Model | Why |
|------|-------|-----|
| Analyst | Gemini 2.5 Pro | 1M token context for massive datasets, $1.25/M input |
| Strategist | Gemini 2.5 Pro | Creative strategy generation with full data context |
| Reflector | Gemini 2.0 Flash | Cheaper for self-assessment on summarized data |
| Chatbot | Gemini 2.5 Pro | Natural conversation quality |

### Memory System (3-Tier)

- **Short-term** (24h) — Current observations, market conditions
- **Mid-term** (decays over weeks) — Patterns, hypotheses being tested
- **Long-term** (permanent) — Proven lessons, strategy rules, anti-patterns

Memories get promoted up tiers as they're validated, and decay if not referenced.

### Safety

- All config changes bounded by hard limits (can't set crazy values)
- Every change logged with before/after state
- Past decisions tracked and scored (improved/degraded/neutral)
- BigQuery is read-only (no writes, no model training)
- Only modifies its own 3 FT wallets
- Dry run mode available

### Deployment

- Runs on Vercel as part of the existing Next.js app
- Cron: daily at 6 AM UTC via `vercel.json` (adjustable as volume grows)
- API endpoints under `/api/alpha-agent/`
- Dashboard: Trading page > Alpha AI tab (admin-only), with full view at `/alpha-agent`

---

## Database Tables

| Table | Purpose |
|-------|---------|
| `alpha_agent_bots` | Maps the 3 agent bots to their FT wallets |
| `alpha_agent_memory` | 3-tier persistent memory with tags, confidence, decay |
| `alpha_agent_runs` | Full audit log of every agent cycle |
| `alpha_agent_decisions` | Every strategy change with reasoning + outcome tracking |
| `alpha_agent_snapshots` | Time-series performance snapshots per bot |
| `alpha_agent_hypotheses` | Testable hypotheses with status tracking |
| `alpha_agent_exit_rules` | Exit/selling strategy rules per bot |

---

## What Makes This Different

1. **It learns from the entire fleet** — not just its own trades, but all 66+ bots. It can see which strategies work across different market conditions.

2. **It has memory** — unlike a stateless prompt, it remembers what it tried, what worked, what failed, and why. Knowledge compounds over time.

3. **It's recursive** — it identifies gaps in its own thinking and proposes new ways to analyze data. It gets better at getting better.

4. **It's safe** — bounded configs, full audit trail, dry run mode, read-only BigQuery. It can't damage anything.

5. **You can talk to it** — the chatbot interface lets you interrogate its reasoning, ask about specific trades, understand why it made decisions, and even suggest strategies for it to test.

---

## Files Created

```
lib/alpha-agent/
├── index.ts              # Barrel exports
├── types.ts              # Type definitions, config boundaries, multi-model config
├── agent-core.ts         # Main orchestration loop
├── data-analyzer.ts      # Performance data collection & analysis
├── memory-system.ts      # 3-tier memory with promotion, decay, reflection
├── llm-engine.ts         # Gemini-powered reasoning + chatbot
├── strategy-optimizer.ts # Strategy change application with safety
└── bigquery-tool.ts      # Read-only BigQuery query tool

app/alpha-agent/
├── page.tsx              # Command center (chat + monitoring)
└── [id]/page.tsx         # Bot detail page (trades + decisions + chat)

app/api/alpha-agent/
├── run/route.ts          # Trigger agent cycle
├── bootstrap/route.ts    # First-run initialization
├── status/route.ts       # Agent status
├── runs/route.ts         # Run history
├── memories/route.ts     # Memory browser
└── chat/route.ts         # Chatbot conversation

app/api/cron/
└── alpha-agent/route.ts  # Vercel cron endpoint (every 30 min)

supabase/migrations/
└── 20260215_create_alpha_agent_tables.sql  # All database tables + seed data
```
