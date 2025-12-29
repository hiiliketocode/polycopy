'use client'

import { useState } from 'react'

type Json = Record<string, any>

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 text-lg font-semibold">{title}</div>
      {children}
    </div>
  )
}

function Button({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
    >
      {children}
    </button>
  )
}

function TextInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string | number
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <label className="flex w-full flex-col gap-1 text-sm">
      <span className="text-gray-700">{label}</span>
      <input
        className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
      />
    </label>
  )
}

const fetchJson = async (url: string, opts?: RequestInit) => {
  const res = await fetch(url, opts)
  const json = await res.json()
  return { status: res.status, json }
}

export default function TradingTestPage() {
  const [authResult, setAuthResult] = useState<Json | null>(null)
  const [openOrders, setOpenOrders] = useState<Json | null>(null)
  const [positions, setPositions] = useState<Json | null>(null)
  const [dryRunResult, setDryRunResult] = useState<Json | null>(null)
  const [placeResult, setPlaceResult] = useState<Json | null>(null)
  const [cancelResult, setCancelResult] = useState<Json | null>(null)
  const [closeResult, setCloseResult] = useState<Json | null>(null)

  const [tokenId, setTokenId] = useState('')
  const [price, setPrice] = useState('')
  const [amount, setAmount] = useState('')
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY')
  const [orderHash, setOrderHash] = useState('')
  const [confirmPlace, setConfirmPlace] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)

  const handleAuthCheck = async () => {
    const res = await fetchJson('/api/polymarket/auth-check')
    setAuthResult(res)
  }

  const handleOpenOrders = async () => {
    const res = await fetchJson('/api/polymarket/orders/open')
    setOpenOrders(res)
  }

  const handlePositions = async () => {
    const res = await fetchJson('/api/polymarket/positions')
    setPositions(res)
  }

  const handleDryRun = async () => {
    const body = { tokenId, price: Number(price), amount: Number(amount), side }
    const res = await fetchJson('/api/polymarket/orders/dry-run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setDryRunResult(res)
  }

  const handlePlace = async () => {
    const body = {
      tokenId,
      price: Number(price),
      amount: Number(amount),
      side,
      confirm: true,
    }
    const res = await fetchJson('/api/polymarket/orders/place', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setPlaceResult(res)
    if (res?.json?.orderId) {
      setOrderHash(res.json.orderId)
    }
  }

  const handleCancel = async () => {
    const body = { orderHash }
    const res = await fetchJson('/api/polymarket/orders/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setCancelResult(res)
  }

  const handleClose = async () => {
    const body = {
      tokenId,
      amount: Number(amount),
      price: Number(price),
      confirm: true,
    }
    const res = await fetchJson('/api/polymarket/orders/place', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, side: 'SELL' }),
    })
    setCloseResult(res)
  }

  const pretty = (data: any) => (
    <pre className="overflow-auto rounded bg-gray-50 p-3 text-xs text-gray-800">
      {JSON.stringify(data, null, 2)}
    </pre>
  )

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-6">
      <h1 className="text-2xl font-bold">Polymarket Trading Test</h1>

      <Section title="1) Connection Status">
        <div className="flex items-center gap-3">
          <Button onClick={handleAuthCheck}>Run Auth Check</Button>
          {authResult && (
            <span className="text-sm text-gray-600">
              Status: {authResult.status} | Proxy: {authResult.json?.proxy}
            </span>
          )}
        </div>
        {authResult && pretty(authResult)}
      </Section>

      <Section title="2) Open Positions">
        <div className="flex items-center gap-3">
          <Button onClick={handlePositions}>Refresh Positions</Button>
          {positions && <span className="text-sm text-gray-600">Count: {positions.json?.count}</span>}
        </div>
        {positions?.json?.positions?.length ? (
          <div className="mt-3 overflow-auto rounded border border-gray-100">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">Token</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">Direction</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">Size</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">Avg Entry</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">Outcome</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">Last Trade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {positions.json.positions.map((pos: any) => (
                  <tr key={pos.tokenId}>
                    <td className="px-3 py-2 font-mono text-xs text-gray-800">{pos.tokenId}</td>
                    <td className="px-3 py-2 text-gray-800">{pos.direction}</td>
                    <td className="px-3 py-2 text-gray-800">{pos.size}</td>
                    <td className="px-3 py-2 text-gray-800">
                      {pos.avgEntryPrice !== null ? pos.avgEntryPrice : '—'}
                    </td>
                    <td className="px-3 py-2 text-gray-800">{pos.outcome}</td>
                    <td className="px-3 py-2 text-gray-800 text-xs">{pos.lastTradeAt ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-3 text-sm text-gray-600">No open positions detected.</p>
        )}
        {positions && pretty(positions)}
      </Section>

      <Section title="3) Create New Trade">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <TextInput label="Token ID" value={tokenId} onChange={setTokenId} />
          <TextInput label="Price" value={price} onChange={setPrice} />
          <TextInput label="Amount" value={amount} onChange={setAmount} />
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-gray-700">Side</span>
            <select
              className="rounded border border-gray-300 px-3 py-2 text-sm"
              value={side}
              onChange={e => setSide(e.target.value as 'BUY' | 'SELL')}
            >
              <option value="BUY">BUY</option>
              <option value="SELL">SELL</option>
            </select>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button onClick={handleDryRun}>Dry Run</Button>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={confirmPlace}
              onChange={e => setConfirmPlace(e.target.checked)}
            />
            I understand this places a real order (test size only)
          </label>
          <Button onClick={handlePlace} disabled={!confirmPlace}>
            Place Order
          </Button>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          {dryRunResult && (
            <div>
              <div className="text-sm font-semibold">Dry Run</div>
              {pretty(dryRunResult)}
            </div>
          )}
          {placeResult && (
            <div>
              <div className="text-sm font-semibold">Place Order</div>
              {pretty(placeResult)}
            </div>
          )}
        </div>
      </Section>

      <Section title="4) Open Orders">
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={handleOpenOrders}>Refresh Open Orders</Button>
          <TextInput
            label="Order Hash"
            value={orderHash}
            onChange={setOrderHash}
            placeholder="Set from place result"
          />
          <Button onClick={handleCancel} disabled={!orderHash}>
            Cancel Order
          </Button>
        </div>
        {openOrders && pretty(openOrders)}
        {cancelResult && (
          <div className="mt-3">
            <div className="text-sm font-semibold">Cancel Result</div>
            {pretty(cancelResult)}
          </div>
        )}
      </Section>

      <Section title="5) Close Position">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={confirmClose}
              onChange={e => setConfirmClose(e.target.checked)}
            />
            Confirm close (SELL amount @ price)
          </label>
          <Button onClick={handleClose} disabled={!confirmClose}>
            Close Position
          </Button>
        </div>
        {closeResult && pretty(closeResult)}
      </Section>
    </div>
  )
}
