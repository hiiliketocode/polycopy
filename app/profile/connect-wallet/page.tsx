'use client'

import { useCallback, useEffect, useState } from 'react'
import { verifyMessage } from 'ethers'

const TURNKEY_UI_ENABLED = process.env.NEXT_PUBLIC_TURNKEY_ENABLED === 'true'

type WalletCreateResponse = {
  walletId: string
  address: string
  isNew: boolean
  error?: string
}

type SignTestResponse = {
  address: string
  signature: string
  message: string
  error?: string
}

type ValidateResponse = {
  isValidAddress: boolean
  isContract: boolean
  chainId: number
  error?: string
}

type BalanceResponse = {
  accountAddress: string
  usdcBalanceRaw: string
  usdcBalanceFormatted: string
  error?: string
}

type LinkStatus = {
  polymarket_account_address: string | null
  has_imported_key: boolean
  eoa_address: string | null
  has_l2_credentials: boolean
  last_error?: string | null
}

type StepStatus = 'done' | 'needs_attention' | 'not_started'

const STEP_BADGE_STYLES: Record<StepStatus, string> = {
  done: 'bg-emerald-50 text-emerald-800 border border-emerald-200',
  needs_attention: 'bg-amber-50 text-amber-800 border border-amber-200',
  not_started: 'bg-slate-100 text-slate-600 border border-slate-200',
}

const STEP_BADGE_LABELS: Record<StepStatus, string> = {
  done: 'Done',
  needs_attention: 'Needs attention',
  not_started: 'Not started',
}

export default function ConnectWalletTurnkeyPage() {
  const [createLoading, setCreateLoading] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [walletData, setWalletData] = useState<WalletCreateResponse | null>(null)

  const [signLoading, setSignLoading] = useState(false)
  const [signError, setSignError] = useState<string | null>(null)
  const [signData, setSignData] = useState<SignTestResponse | null>(null)
  const [message, setMessage] = useState('Hello from Turnkey!')
  
  const [verificationResult, setVerificationResult] = useState<{
    success: boolean
    recoveredAddress: string
    expectedAddress: string
  } | null>(null)

  // Polymarket account validation state
  const [polymarketAddress, setPolymarketAddress] = useState('')
  const [validateLoading, setValidateLoading] = useState(false)
  const [validateError, setValidateError] = useState<string | null>(null)
  const [validateData, setValidateData] = useState<ValidateResponse | null>(null)

  // USDC balance state
  const [balanceLoading, setBalanceLoading] = useState(false)
  const [balanceError, setBalanceError] = useState<string | null>(null)
  const [balanceData, setBalanceData] = useState<BalanceResponse | null>(null)

  // L2 credentials state
  const [l2Loading, setL2Loading] = useState(false)
  const [l2Error, setL2Error] = useState<string | null>(null)
  const [l2Data, setL2Data] = useState<{
    ok: boolean
    apiKey: string
    validated: boolean
    createdAt: string
    isExisting?: boolean
  } | null>(null)

  // Import wallet state
  const [importLoading, setImportLoading] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [importData, setImportData] = useState<{
    walletId: string
    address: string
    alreadyImported?: boolean
  } | null>(null)
  const [magicPrivateKey, setMagicPrivateKey] = useState('')
  const [importBundle, setImportBundle] = useState<string | null>(null)
  const [importOrgId, setImportOrgId] = useState<string | null>(null)
  const [importUserId, setImportUserId] = useState<string | null>(null)

  const [linkStatus, setLinkStatus] = useState<LinkStatus | null>(null)
  const [linkStatusLoading, setLinkStatusLoading] = useState(true)
  const [linkStatusError, setLinkStatusError] = useState<string | null>(null)
  const [expandedStep, setExpandedStep] = useState<'account' | 'import' | 'credentials' | null>(null)

  useEffect(() => {
    let cancelled = false

    const fetchImportBundle = async () => {
      try {
        const res = await fetch('/api/turnkey/import-private-key', {
          method: 'GET',
          credentials: 'include',
        })
        const data = await res.json()

        if (!res.ok) {
          throw new Error(data?.error || 'Failed to load import configuration')
        }

        if (!cancelled) {
          setImportBundle(data.importBundle || null)
          setImportOrgId(data.organizationId || null)
          setImportUserId(data.userId || null)
          console.log(
            `[Import] Loaded import bundle len=${(data.importBundle || '').length}`
          )
        }
      } catch (err: any) {
        if (!cancelled) {
          setImportError(err?.message || 'Failed to load import configuration')
        }
      }
    }

    if (TURNKEY_UI_ENABLED) {
      fetchImportBundle()
    }

    return () => {
      cancelled = true
    }
  }, [])

  const loadLinkStatus = useCallback(async () => {
    setLinkStatusLoading(true)
    setLinkStatusError(null)

    try {
      const res = await fetch('/api/polymarket/link-status', {
        method: 'GET',
        credentials: 'include',
      })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to fetch link status')
      }

      setLinkStatus(data)
      setPolymarketAddress(data?.polymarket_account_address || '')
    } catch (err: any) {
      setLinkStatusError(err?.message || 'Failed to fetch link status')
      setLinkStatus(null)
    } finally {
      setLinkStatusLoading(false)
    }
  }, [])

  useEffect(() => {
    loadLinkStatus()
  }, [loadLinkStatus])


  const createWallet = async () => {
    setCreateLoading(true)
    setCreateError(null)
    setWalletData(null)
    setSignData(null)
    setVerificationResult(null)

    try {
      const res = await fetch('/api/turnkey/wallet/create', {
        method: 'POST',
        credentials: 'include', // Include cookies for auth
      })
      const data = (await res.json()) as WalletCreateResponse

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to create wallet')
      }

      setWalletData(data)
    } catch (err: any) {
      setCreateError(err?.message || 'Failed to create wallet')
    } finally {
      setCreateLoading(false)
    }
  }

  const signMessage = async () => {
    if (!message.trim()) {
      setSignError('Please enter a message to sign')
      return
    }

    setSignLoading(true)
    setSignError(null)
    setSignData(null)
    setVerificationResult(null)

    try {
      const res = await fetch('/api/turnkey/sign-test', {
        method: 'POST',
        credentials: 'include', // Include cookies for auth
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      })

      const data = (await res.json()) as SignTestResponse

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to sign message')
      }

      setSignData(data)
      
      // Verify signature on client
      try {
        const recoveredAddress = verifyMessage(data.message, data.signature)
        const matches = recoveredAddress.toLowerCase() === data.address.toLowerCase()
        
        setVerificationResult({
          success: matches,
          recoveredAddress,
          expectedAddress: data.address,
        })
      } catch (verifyErr: any) {
        setSignError(`Signature verification failed: ${verifyErr.message}`)
      }
    } catch (err: any) {
      setSignError(err?.message || 'Failed to sign message')
    } finally {
      setSignLoading(false)
    }
  }

  const validateAccount = async () => {
    if (!polymarketAddress.trim()) {
      setValidateError('Please enter a Polymarket wallet address')
      return
    }

    setValidateLoading(true)
    setValidateError(null)
    setValidateData(null)
    setBalanceData(null)

    try {
      const res = await fetch('/api/turnkey/polymarket/validate-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountAddress: polymarketAddress }),
      })

      const data = (await res.json()) as ValidateResponse

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to validate account')
      }

      setValidateData(data)
    } catch (err: any) {
      setValidateError(err?.message || 'Failed to validate account')
    } finally {
      setValidateLoading(false)
    }
  }

  const fetchBalance = async () => {
    if (!polymarketAddress.trim()) {
      setBalanceError('Please enter a Polymarket wallet address')
      return
    }

    setBalanceLoading(true)
    setBalanceError(null)
    setBalanceData(null)

    try {
      const res = await fetch('/api/turnkey/polymarket/usdc-balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountAddress: polymarketAddress }),
      })

      const data = (await res.json()) as BalanceResponse

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to fetch balance')
      }

      setBalanceData(data)
    } catch (err: any) {
      setBalanceError(err?.message || 'Failed to fetch balance')
    } finally {
      setBalanceLoading(false)
    }
  }

  const generateL2Credentials = async () => {
    if (!polymarketAddress.trim()) {
      setL2Error('Please enter and validate a Polymarket wallet address first')
      return
    }

    if (!validateData?.isContract && !linkStatus?.has_imported_key) {
      setL2Error('Please validate that the address is a contract wallet first')
      return
    }

    setL2Loading(true)
    setL2Error(null)
    setL2Data(null)

    try {
      const res = await fetch('/api/polymarket/l2-credentials', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          polymarketAccountAddress: polymarketAddress,
          signatureType: 0 // 0=EOA, 1=POLY_PROXY, 2=GNOSIS_SAFE
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to generate L2 credentials')
      }

      setL2Data(data)
      await loadLinkStatus()
    } catch (err: any) {
      setL2Error(err?.message || 'Failed to generate L2 credentials')
    } finally {
      setL2Loading(false)
    }
  }

  const openPolymarketExport = () => {
    // Open Polymarket's Magic Link key export page in a new tab
    window.open('https://reveal.magic.link/polymarket', '_blank', 'noreferrer')
  }

  const startImportFlow = async () => {
    const trimmedKey = magicPrivateKey.trim()
    if (!trimmedKey) {
      setImportError('Paste your Magic private key (0x...) before importing')
      setImportData(null)
      return
    }
    if (!trimmedKey.startsWith('0x') || trimmedKey.length !== 66) {
      setImportError('Private key must start with 0x and be 66 chars long')
      setImportData(null)
      return
    }
    if (!polymarketAddress.trim()) {
      setImportError('Enter your Polymarket wallet address before importing')
      setImportData(null)
      return
    }
    if (!importBundle || !importOrgId || !importUserId) {
      setImportError('Import bundle not loaded. Please refresh and try again.')
      setImportData(null)
      return
    }

    setImportLoading(true)
    setImportError(null)
    setImportData(null)

    try {
      const { encryptPrivateKeyToBundle } = await import('@turnkey/crypto')

      const encryptedBundleString = await encryptPrivateKeyToBundle({
        privateKey: trimmedKey,
        keyFormat: 'HEXADECIMAL',
        importBundle,
        userId: importUserId,
        organizationId: importOrgId,
      })

      console.log(
        `[Import] Encrypted bundle created (len=${encryptedBundleString.length})`
      )

      let encryptedBundle: Record<string, any>
      try {
        encryptedBundle = JSON.parse(encryptedBundleString)
      } catch (parseErr) {
        throw new Error('Failed to parse encrypted bundle JSON from Turnkey SDK')
      }

      const res = await fetch('/api/turnkey/import-private-key', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          polymarket_account_address: polymarketAddress.trim(),
          encryptedBundle,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to import wallet')
      }

      setImportData({
        walletId: data.walletId,
        address: data.address,
        alreadyImported: data.alreadyImported,
      })
      await loadLinkStatus()
    } catch (err: any) {
      setImportError(err?.message || 'Failed to import wallet')
    } finally {
      setImportLoading(false)
    }
  }

  const hasPolymarketAddress = Boolean(linkStatus?.polymarket_account_address)
  const hasImportedKey = Boolean(linkStatus?.has_imported_key)
  const hasL2Credentials = Boolean(linkStatus?.has_l2_credentials)
  const localAddressEntered = Boolean(polymarketAddress.trim())
  const canUseStep2 = localAddressEntered && TURNKEY_UI_ENABLED
  const canUseStep3 = hasImportedKey && TURNKEY_UI_ENABLED

  const step1Status: StepStatus = hasPolymarketAddress
    ? 'done'
    : linkStatusError
      ? 'needs_attention'
      : 'not_started'

  const step2Status: StepStatus = hasImportedKey
    ? 'done'
    : hasPolymarketAddress
      ? 'needs_attention'
      : 'not_started'

  const step3Status: StepStatus = hasL2Credentials
    ? 'done'
    : hasImportedKey
      ? 'needs_attention'
      : 'not_started'

  const shouldShowStep = (key: 'account' | 'import' | 'credentials') => {
    if (expandedStep === key) return true
    if (key === 'account' && !hasPolymarketAddress) return true
    if (key === 'import' && hasPolymarketAddress && !hasImportedKey) return true
    if (key === 'credentials' && hasImportedKey && !hasL2Credentials) return true
    return false
  }

  const toggleStep = (key: 'account' | 'import' | 'credentials') => {
    setExpandedStep((prev) => (prev === key ? null : key))
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Link my Polymarket account</h1>
        <p className="text-slate-600 mt-2">
          Validate your Polymarket proxy wallet, import your Magic Link key, and enable Polymarket L2 trading credentials.
        </p>
      </div>

      {!TURNKEY_UI_ENABLED && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800">
          Set <code className="bg-amber-100 px-2 py-1 rounded">NEXT_PUBLIC_TURNKEY_ENABLED=true</code> in <code className="bg-amber-100 px-2 py-1 rounded">.env.local</code> to
          interact with this page. Backend also requires <code className="bg-amber-100 px-2 py-1 rounded">TURNKEY_ENABLED=true</code>.
        </div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">Link status</p>
            <p className="text-xs text-slate-500">Status updates automatically after each step.</p>
          </div>
          <button
            onClick={() => loadLinkStatus()}
            disabled={linkStatusLoading}
            className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 disabled:opacity-50 hover:bg-slate-50"
          >
            {linkStatusLoading ? 'Refreshing…' : 'Refresh status'}
          </button>
        </div>

        {linkStatusError && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            ❌ {linkStatusError}
          </div>
        )}

        {/* Step 1 */}
        <div className="rounded-xl border border-slate-200 p-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Step 1</p>
              <h3 className="text-lg font-semibold text-slate-900">Confirm Polymarket account</h3>
              <p className="text-sm text-slate-600">
                Validate your Polymarket proxy wallet and confirm it is ready for copying trades.
              </p>
            </div>
            <span
              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${STEP_BADGE_STYLES[step1Status]}`}
            >
              {STEP_BADGE_LABELS[step1Status]}
            </span>
          </div>

          {shouldShowStep('account') ? (
            <>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Polymarket Profile Wallet Address
                  </label>
                  <input
                    type="text"
                    value={polymarketAddress}
                    onChange={(e) => setPolymarketAddress(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 font-mono text-sm"
                    placeholder="0x..."
                    disabled={!TURNKEY_UI_ENABLED}
                  />
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={validateAccount}
                    disabled={validateLoading || !TURNKEY_UI_ENABLED || !polymarketAddress.trim()}
                    className="rounded-md bg-purple-600 px-4 py-2 text-white font-semibold disabled:opacity-60 hover:bg-purple-700 transition-colors"
                  >
                    {validateLoading ? 'Validating...' : 'Validate address'}
                  </button>

                  {validateData?.isContract && (
                    <button
                      onClick={fetchBalance}
                      disabled={balanceLoading || !TURNKEY_UI_ENABLED}
                      className="rounded-md bg-emerald-600 px-4 py-2 text-white font-semibold disabled:opacity-60 hover:bg-emerald-700 transition-colors"
                    >
                      {balanceLoading ? 'Fetching...' : 'Fetch USDC balance'}
                    </button>
                  )}
                </div>
              </div>

              {validateError && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-red-700">
                  ❌ {validateError}
                </div>
              )}

              {validateData && (
                <div
                  className={`rounded-md border p-4 ${
                    validateData.isContract ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'
                  }`}
                >
                  <div
                    className={`flex items-center gap-2 font-semibold ${
                      validateData.isContract ? 'text-emerald-800' : 'text-red-800'
                    }`}
                  >
                    {validateData.isContract
                      ? '✅ Contract wallet detected (Safe/proxy)'
                      : '❌ Not a contract. Double-check the address.'}
                  </div>
                  <div className="space-y-1 text-sm mt-2">
                    <div className="flex justify-between">
                      <span className="font-semibold text-slate-700">Chain ID:</span>
                      <span>{validateData.chainId} (Polygon)</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-semibold text-slate-700">Valid Address:</span>
                      <span>{validateData.isValidAddress ? 'Yes' : 'No'}</span>
                    </div>
                  </div>
                </div>
              )}

              {balanceError && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-red-700">
                  ❌ {balanceError}
                </div>
              )}

              {balanceData && (
                <div className="space-y-2 rounded-md border border-blue-200 bg-blue-50 p-4">
                  <div className="flex items-center gap-2 text-blue-800 font-semibold">
                    💰 USDC Balance Fetched
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex flex-col gap-1">
                      <span className="font-semibold text-slate-700">Address:</span>
                      <code className="bg-white px-2 py-1 border border-slate-200 rounded break-all text-xs">
                        {balanceData.accountAddress}
                      </code>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-slate-700">Balance:</span>
                      <span className="text-2xl font-bold text-blue-900">{balanceData.usdcBalanceFormatted}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs text-slate-600">
                      <span>Raw Value:</span>
                      <code>{balanceData.usdcBalanceRaw}</code>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : hasPolymarketAddress ? (
            <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 md:flex-row md:items-center md:justify-between">
              <div className="text-sm text-slate-700">
                <p className="font-semibold text-slate-900">Linked Polymarket account</p>
                <code className="mt-1 block rounded bg-white px-2 py-1 font-mono text-xs text-slate-900">
                  {linkStatus?.polymarket_account_address}
                </code>
                {linkStatus?.eoa_address && (
                  <p className="mt-2 text-xs text-slate-500">
                    Magic EOA: <code className="font-mono">{linkStatus.eoa_address}</code>
                  </p>
                )}
              </div>
              <button
                onClick={() => toggleStep('account')}
                className="self-start rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-white"
              >
                Change
              </button>
            </div>
          ) : null}
        </div>

        {/* Step 2 */}
        <div className="rounded-xl border border-slate-200 p-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Step 2</p>
              <h3 className="text-lg font-semibold text-slate-900">Import Magic Link key</h3>
              <p className="text-sm text-slate-600">
                Encrypt your Magic Link private key in-browser and store it securely in Turnkey.
              </p>
            </div>
            <span
              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${STEP_BADGE_STYLES[step2Status]}`}
            >
              {STEP_BADGE_LABELS[step2Status]}
            </span>
          </div>

          {shouldShowStep('import') ? (
            <>
              {(!localAddressEntered || !TURNKEY_UI_ENABLED) && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  Enter and validate your Polymarket address above to enable importing.
                </div>
              )}

              {TURNKEY_UI_ENABLED && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Paste Magic private key (0x…)
                  </label>
                  <textarea
                    value={magicPrivateKey}
                    onChange={(e) => setMagicPrivateKey(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono text-sm"
                    placeholder="0x..."
                    rows={3}
                  />
                  <p className="text-xs text-slate-600 mt-1">
                    Key stays in the browser; only the encrypted bundle is sent to Turnkey.
                  </p>
                </div>
              )}

              <div className="flex flex-wrap gap-3">
                <button
                  onClick={openPolymarketExport}
                  disabled={!TURNKEY_UI_ENABLED}
                  className="rounded-md bg-purple-600 px-4 py-2 text-white font-semibold disabled:opacity-60 hover:bg-purple-700 transition-colors"
                >
                  🔑 Open Polymarket Key Export
                </button>

                <button
                  onClick={startImportFlow}
                  disabled={importLoading || !canUseStep2}
                  className="rounded-md bg-indigo-600 px-4 py-2 text-white font-semibold disabled:opacity-50 hover:bg-indigo-700 transition-colors"
                >
                  {importLoading ? 'Importing...' : 'Import Magic Link Key'}
                </button>
              </div>

              <div className="text-xs text-indigo-600 border border-indigo-200 bg-white rounded p-2">
                ℹ️ <strong>Security:</strong> Keys are encrypted locally with the Turnkey HPKE bundle before leaving your browser.
              </div>

              <div className="text-xs text-slate-600 border border-slate-200 bg-slate-50 rounded p-2">
                <p className="font-semibold mb-1">📋 Instructions</p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Open the Polymarket export page in a new tab.</li>
                  <li>Copy the Magic private key and paste it above.</li>
                  <li>Click “Import Magic Link Key” to encrypt and store it in Turnkey.</li>
                </ol>
              </div>
            </>
          ) : hasImportedKey ? (
            <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 md:flex-row md:items-center md:justify-between">
              <div className="text-sm text-slate-700">
                <p className="font-semibold text-slate-900">Magic Link key imported</p>
                {linkStatus?.eoa_address && (
                  <p className="mt-1 text-xs text-slate-500">
                    EOA: <code className="font-mono">{linkStatus.eoa_address}</code>
                  </p>
                )}
              </div>
              <button
                onClick={() => toggleStep('import')}
                className="self-start rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-white"
              >
                Re-import
              </button>
            </div>
          ) : null}

          {importError && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-red-700">
              ❌ {importError}
            </div>
          )}

          {importData && (
            <div className="space-y-2 rounded-md border border-green-200 bg-green-50 p-4">
              <div className="flex items-center gap-2 text-green-800 font-semibold text-lg">
                {importData.alreadyImported ? '✅ Existing Wallet Retrieved' : '🔑 Wallet Imported Successfully'}
              </div>
              
              <div className="space-y-2 text-sm">
                <div className="flex flex-col gap-1">
                  <span className="font-semibold text-slate-700">Wallet ID:</span>
                  <code className="bg-white px-2 py-1 border border-slate-200 rounded break-all text-xs font-mono">
                    {importData.walletId}
                  </code>
                </div>

                <div className="flex flex-col gap-1">
                  <span className="font-semibold text-slate-700">Address (EOA):</span>
                  <code className="bg-white px-2 py-1 border border-slate-200 rounded break-all text-xs font-mono">
                    {importData.address}
                  </code>
                </div>

                {importData.alreadyImported && (
                  <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-700">
                    ℹ️ This wallet was already imported (idempotent - no duplicate created)
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Step 3 */}
        <div className="rounded-xl border border-slate-200 p-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Step 3</p>
              <h3 className="text-lg font-semibold text-slate-900">Generate Polymarket L2 credentials</h3>
              <p className="text-sm text-slate-600">
                Create API credentials so Polycopy can submit CLOB orders on your behalf.
              </p>
            </div>
            <span
              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${STEP_BADGE_STYLES[step3Status]}`}
            >
              {STEP_BADGE_LABELS[step3Status]}
            </span>
          </div>

          {shouldShowStep('credentials') ? (
            <>
              <div className="space-y-3">
                <button
                  onClick={generateL2Credentials}
                  disabled={l2Loading || !canUseStep3}
                  className="rounded-md bg-orange-600 px-4 py-2 text-white font-semibold disabled:opacity-60 hover:bg-orange-700 transition-colors"
                >
                  {l2Loading ? 'Generating...' : 'Generate L2 credentials'}
                </button>
                {!canUseStep3 && (
                  <p className="text-sm text-orange-700">
                    Import your Magic Link key in Step 2 before generating credentials.
                  </p>
                )}
              </div>

              {l2Error && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-red-700">
                  ❌ {l2Error}
                </div>
              )}

              {l2Data && (
                <div className="space-y-3 rounded-md border border-green-200 bg-green-50 p-4">
                  <div className="flex items-center gap-2 text-green-800 font-semibold text-lg">
                    {l2Data.isExisting ? '✅ Existing Credentials Retrieved' : '🔑 L2 Credentials Generated'}
                  </div>
                  
                  <div className="space-y-2 text-sm">
                    <div className="flex flex-col gap-1">
                      <span className="font-semibold text-slate-700">API Key:</span>
                      <code className="bg-white px-2 py-1 border border-slate-200 rounded break-all text-xs font-mono">
                        {l2Data.apiKey}
                      </code>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-slate-700">Validated:</span>
                      <span className={`font-bold ${l2Data.validated ? 'text-green-700' : 'text-red-700'}`}>
                        {l2Data.validated ? '✅ Yes' : '❌ No'}
                      </span>
                    </div>

                    <div className="flex justify-between items-center text-xs text-slate-600">
                      <span>Created:</span>
                      <span>{new Date(l2Data.createdAt).toLocaleString()}</span>
                    </div>

                    {l2Data.isExisting && (
                      <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-700">
                        ℹ️ Using existing credentials (idempotent - no new key created)
                      </div>
                    )}
                  </div>

                  <div className="border-t border-green-300 pt-2 mt-2">
                    <p className="text-xs text-slate-600">
                      🔒 <strong>Security:</strong> Secrets stay encrypted in the database and are never exposed to the client.
                    </p>
                  </div>
                </div>
              )}
            </>
          ) : hasL2Credentials ? (
            <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 md:flex-row md:items-center md:justify-between">
              <div className="text-sm text-slate-700">
                <p className="font-semibold text-slate-900">Active L2 credentials</p>
                <p className="text-xs text-slate-500">Ready to submit orders through Polymarket's CLOB.</p>
              </div>
              <button
                onClick={() => toggleStep('credentials')}
                className="self-start rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-white"
              >
                Retry
              </button>
            </div>
          ) : !hasImportedKey ? (
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
              Complete Step 2 to unlock L2 credentials.
            </div>
          ) : null}
        </div>
      </section>

      <details className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <summary className="flex cursor-pointer items-center justify-between px-6 py-4 text-slate-900 font-semibold select-none">
          <span>Developer tools</span>
          <span className="text-sm text-slate-500">Toggle</span>
        </summary>
        <div className="border-t border-slate-100 p-6 space-y-6 text-sm text-slate-700">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Turnkey Wallet MVP Tester</h2>
            <p className="text-slate-600 mt-1">
              Manual harness for wallet creation and signature verification.
            </p>
          </div>

          {/* Step 1: Create Wallet */}
          <section className="rounded-lg border border-slate-200 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">Create/Retrieve Wallet</h3>
                <p className="text-sm text-slate-600">Idempotent operation - returns same wallet if it already exists.</p>
              </div>
              <button
                onClick={createWallet}
                disabled={createLoading || !TURNKEY_UI_ENABLED}
                className="rounded-md bg-purple-600 px-4 py-2 text-white font-semibold disabled:opacity-60 hover:bg-purple-700 transition-colors"
              >
                {createLoading ? 'Creating...' : 'Create Wallet'}
              </button>
            </div>

            {createError && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-red-700">
                ❌ {createError}
              </div>
            )}

            {walletData && (
              <div className="space-y-2 rounded-md border border-emerald-200 bg-emerald-50 p-4">
                <div className="flex items-center gap-2 text-emerald-800 font-semibold">
                  ✅ Wallet {walletData.isNew ? 'Created' : 'Retrieved'} Successfully
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex flex-col gap-1">
                    <span className="font-semibold text-slate-700">Wallet ID:</span>
                    <code className="bg-white px-2 py-1 border border-slate-200 rounded break-all">
                      {walletData.walletId}
                    </code>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="font-semibold text-slate-700">Address:</span>
                    <code className="bg-white px-2 py-1 border border-slate-200 rounded break-all">
                      {walletData.address}
                    </code>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Step 2: Sign Message */}
          <section className="rounded-lg border border-slate-200 p-4 space-y-3">
            <div>
              <h3 className="text-lg font-semibold">Sign Test Message</h3>
              <p className="text-sm text-slate-600">Sign a message and verify signature recovery.</p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Message to Sign:
                </label>
                <input
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  placeholder="Enter message to sign"
                  disabled={!TURNKEY_UI_ENABLED}
                />
              </div>

              <button
                onClick={signMessage}
                disabled={signLoading || !TURNKEY_UI_ENABLED || !message.trim()}
                className="rounded-md bg-emerald-600 px-4 py-2 text-white font-semibold disabled:opacity-60 hover:bg-emerald-700 transition-colors"
              >
                {signLoading ? 'Signing...' : 'Sign Message'}
              </button>
            </div>

            {signError && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-red-700">
                ❌ {signError}
              </div>
            )}

            {signData && (
              <div className="space-y-3">
                <div className="space-y-2 rounded-md border border-blue-200 bg-blue-50 p-4">
                  <div className="flex items-center gap-2 text-blue-800 font-semibold">
                    📝 Message Signed Successfully
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex flex-col gap-1">
                      <span className="font-semibold text-slate-700">Signer Address:</span>
                      <code className="bg-white px-2 py-1 border border-slate-200 rounded break-all">
                        {signData.address}
                      </code>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="font-semibold text-slate-700">Message:</span>
                      <code className="bg-white px-2 py-1 border border-slate-200 rounded break-all">
                        {signData.message}
                      </code>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="font-semibold text-slate-700">Signature:</span>
                      <code className="bg-white px-2 py-1 border border-slate-200 rounded break-all text-xs">
                        {signData.signature}
                      </code>
                    </div>
                  </div>
                </div>

                {verificationResult && (
                  <div
                    className={`rounded-md border p-4 ${
                      verificationResult.success ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'
                    }`}
                  >
                    <div
                      className={`flex items-center gap-2 font-semibold ${
                        verificationResult.success ? 'text-emerald-800' : 'text-red-800'
                      }`}
                    >
                      {verificationResult.success ? '✅ Signature Verified!' : '❌ Signature Verification Failed'}
                    </div>
                    <div className="space-y-2 text-sm mt-2">
                      <div className="flex flex-col gap-1">
                        <span className="font-semibold text-slate-700">Recovered Address:</span>
                        <code className="bg-white px-2 py-1 border border-slate-200 rounded break-all">
                          {verificationResult.recoveredAddress}
                        </code>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="font-semibold text-slate-700">Expected Address:</span>
                        <code className="bg-white px-2 py-1 border border-slate-200 rounded break-all">
                          {verificationResult.expectedAddress}
                        </code>
                      </div>
                      {verificationResult.success && (
                        <p className="text-emerald-700 font-medium mt-2">
                          ✨ The signature was created by the expected wallet address!
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Acceptance summary */}
          <section className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-2 text-sm text-slate-700">
            <p className="font-semibold">Acceptance Criteria</p>
            <ul className="space-y-1">
              <li className={walletData ? 'text-emerald-700 font-medium' : ''}>
                {walletData ? '✅' : '⬜'} Create wallet returns {'{walletId, address}'} and is idempotent
              </li>
              <li className={verificationResult?.success ? 'text-emerald-700 font-medium' : ''}>
                {verificationResult?.success ? '✅' : '⬜'} Sign-test returns signature that verifies to the returned address
              </li>
            </ul>
          </section>
        </div>
      </details>
    </div>
  )
}
