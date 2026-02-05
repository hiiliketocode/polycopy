import { NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { getAdminSessionUser } from '@/lib/admin'
import {
  buildTradeContextBlock,
  type GeminiAssessment,
  type GeminiChatMessage,
  type TradeAssessmentSnapshot,
} from '@/lib/gemini/trade-assessment'

// Default to a fast but sharper model; allow override via env
// gemini-2.5-flash is the current balanced model (fast + capable)
const MODEL_NAME = process.env.GEMINI_TRADE_MODEL || 'gemini-2.5-flash'

type AssessmentRequest = {
  snapshot: TradeAssessmentSnapshot
  messages?: GeminiChatMessage[]
  userMessage?: string
}

const SYSTEM_INSTRUCTION = `You are Polycopy's admin-only trade adjudicator.
- Goal: recommend whether to copy now and what size (small / regular / large / high) with concise, evidence-backed bullets.
- Inputs include trader niche performance, conviction, entry vs live price, live score/status, timing to start/end, and market metadata. Stay strictly inside provided data; no outside facts.
- SPORTS TIMING: if market is sports/live, eventEndTime/minutesToEnd = game end. Only mention “live” or the score when it changes the edge/risk (e.g., short clock, comeback risk).
- Prioritize sharp insight over obvious statements. Do NOT restate the score or “game is live” unless you attach a specific implication.
- Quantify: edge vs entry (priceEdgePct), ROI from live, minutes to start/end, trader niche win rate/ROI/conviction when present.
- Weigh: (1) trader edge in this niche/bet type, (2) price edge vs live/likely fair, (3) time/volatility path, (4) conviction/position sizing signals, (5) live scoreboard context with implication.
- Bet sizing guidance: map to conviction + edge + time remaining (e.g., high only if strong edge + positive trader stats + time asymmetry).
- Output must be terse and non-repetitive. Rationale bullets max 4 items, each with a numeric or directional claim.
- Output JSON only:
{
  "recommendation": "copy | lean_copy | pass | watch | uncertain",
  "betSize": "small | regular | large | high",
  "confidence": 0-100,
  "headline": "punchy hook",
  "rationale": ["specific, data-backed bullets (edge, trader stat, timing, size)", "..."],
  "liveInsights": ["score/time/market move insights", "..."],
  "riskNotes": ["downside paths, thin edge, liquidity/timing issues", "..."],
  "timingCallout": "one line on clock / resolution timing"
}`

const stripCodeFences = (text: string) => {
  if (!text.includes('```')) return text.trim()
  return text
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim()
}

const safeParseAssessment = (text: string): GeminiAssessment | null => {
  if (!text) return null
  const cleaned = stripCodeFences(text)
  try {
    const parsed = JSON.parse(cleaned)
    if (parsed && typeof parsed === 'object') {
      return {
        recommendation: parsed.recommendation,
        betSize: parsed.betSize,
        confidence: parsed.confidence,
        headline: parsed.headline,
        rationale: parsed.rationale,
        liveInsights: parsed.liveInsights,
        riskNotes: parsed.riskNotes,
        timingCallout: parsed.timingCallout,
        rawText: cleaned,
      }
    }
    return null
  } catch {
    return null
  }
}

export async function POST(request: Request) {
  const adminUser = await getAdminSessionUser()
  if (!adminUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Read API key at runtime (not module load time) to ensure Vercel env vars are available
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY
  
  if (!GEMINI_API_KEY) {
    console.error('[api/admin/gemini-trade-assessor] Missing GEMINI_API_KEY environment variable')
    console.error('[api/admin/gemini-trade-assessor] Available env vars:', {
      hasGeminiKey: !!process.env.GEMINI_API_KEY,
      hasGeminiTradeModel: !!process.env.GEMINI_TRADE_MODEL,
      nodeEnv: process.env.NODE_ENV,
      vercelEnv: process.env.VERCEL_ENV,
    })
    return NextResponse.json({ 
      error: 'Missing GEMINI_API_KEY environment variable. Please ensure it is set in Vercel environment variables.' 
    }, { status: 500 })
  }

  let body: AssessmentRequest
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body?.snapshot) {
    return NextResponse.json({ error: 'snapshot is required' }, { status: 400 })
  }

  const snapshot = body.snapshot as TradeAssessmentSnapshot
  const contextBlock = buildTradeContextBlock(snapshot)
  const userMessage =
    body.userMessage?.trim() ||
    'Assess this trade now. Give verdict and bet size using the snapshot.'

  const history: GeminiChatMessage[] = Array.isArray(body.messages)
    ? body.messages.filter((m) => m?.role && m?.content)
    : []

  const contents = [
    ...history.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })),
    {
      role: 'user' as const,
      parts: [
        {
          text: `Trade Snapshot (all the data you have):\n${contextBlock}\n\nRequest: ${userMessage}\nReturn JSON only.`,
        },
      ],
    },
  ]

  try {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY)
    const model = genAI.getGenerativeModel({
      model: MODEL_NAME,
      generationConfig: {
        maxOutputTokens: 1024,
        temperature: 0.32,
      },
      systemInstruction: SYSTEM_INSTRUCTION,
    })

    const result = await model.generateContent({
      contents,
    })

    const text = result.response.text()
    const analysis = safeParseAssessment(text)

    return NextResponse.json({
      text,
      analysis,
    })
  } catch (error) {
    console.error('[api/admin/gemini-trade-assessor] error', error)
    console.error('[api/admin/gemini-trade-assessor] error details:', {
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
    
    // Provide more detailed error messages
    let errorMessage = 'Failed to get Gemini assessment'
    if (error instanceof Error) {
      errorMessage = error.message
      // Check for common Gemini API errors
      if (error.message.includes('API_KEY')) {
        errorMessage = 'Invalid or missing Gemini API key. Please check your GEMINI_API_KEY environment variable.'
      } else if (error.message.includes('429')) {
        errorMessage = 'Gemini API rate limit exceeded. Please try again later.'
      } else if (error.message.includes('quota')) {
        errorMessage = 'Gemini API quota exceeded. Please check your API quota limits.'
      }
    }
    
    return NextResponse.json(
      { 
        error: errorMessage,
        details: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.stack : String(error)) : undefined
      },
      { status: 500 }
    )
  }
}
