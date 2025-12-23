'use client'

import { useState } from 'react'

type TradeLookupResult =
  | { found: true; table: string; record: any }
  | { found: false; message?: string; error?: string }

export default function TradeLookupPage() {
  const [tradeId, setTradeId] = useState('')
  const [result, setResult] = useState<TradeLookupResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setResult(null)

    if (!tradeId.trim()) {
      setError('Please enter a trade_id.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch(`/api/trade-lookup?tradeId=${encodeURIComponent(tradeId.trim())}`)
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error || data?.message || 'Lookup failed')
      } else {
        setResult(data)
      }
    } catch (err: any) {
      setError(err?.message || 'Network error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-semibold text-slate-900">Trade Lookup</h1>
      <p className="mt-2 text-sm text-slate-600">
        Enter a Polymarket trade_id to fetch the stored record from Supabase.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-3">
        <label className="block text-sm font-medium text-slate-700">
          Trade ID
          <input
            type="text"
            value={tradeId}
            onChange={(e) => setTradeId(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            placeholder="0xabc123..."
          />
        </label>

        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {loading ? 'Looking up…' : 'Lookup Trade'}
        </button>
      </form>

      {error && (
        <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-6 rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
          <h2 className="text-sm font-semibold text-slate-800">Result</h2>
          <pre className="mt-2 overflow-auto whitespace-pre-wrap rounded bg-white px-3 py-2 text-xs text-slate-800">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}
