'use client'

import { useCallback, useEffect, useState } from 'react'
import { verifyMessage } from 'ethers/lib/utils'
import { Navigation } from '@/components/polycopy/navigation'

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
  const [balanceLoading, setBalanceLoading] = useState(false)
  const [balanceError, setBalanceError] = useState<string | null>(null)
  const [balanceData, setBalanceData] = useState<BalanceResponse | null>(null)

// L2 credentials state
  const [l2Loading, setL2Loading] = useState(false)
  const [l2Error, setL2Error] = useState<string | null>(null)
  // Import wallet state
  const [importLoading, setImportLoading] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [magicPrivateKey, setMagicPrivateKey] = useState('')
  const [importBundle, setImportBundle] = useState<string | null>(null)
  const [importOrgId, setImportOrgId] = useState<string | null>(null)
  const [importUserId, setImportUserId] = useState<string | null>(null)

  const [linkStatus, setLinkStatus] = useState<LinkStatus | null>(null)
  const [linkStatusError, setLinkStatusError] = useState<string | null>(null)
  const [accountChecked, setAccountChecked] = useState(false)
  const [activeStage, setActiveStage] = useState<'profile' | 'key'>('profile')
  const [editingProfile, setEditingProfile] = useState(false)
  const [openPositionsCount, setOpenPositionsCount] = useState<number | null>(null)
  const [positionsLoading, setPositionsLoading] = useState(false)
  const [positionsError, setPositionsError] = useState<string | null>(null)
  const [autoCheckedAddress, setAutoCheckedAddress] = useState(false)
  const [linkingMessage, setLinkingMessage] = useState<string | null>(null)
  const [linkingError, setLinkingError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const fetchImportBundle = async () => {
      try {
        const res = await fetch('/api/turnkey/import-private-key', {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
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
    setLinkStatusError(null)

    try {
      const res = await fetch('/api/polymarket/link-status', {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
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
      // no-op
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
        cache: 'no-store',
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
        cache: 'no-store',
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

  const validateAccount = useCallback(async (addressOverride?: string) => {
    const targetAddress = (addressOverride ?? polymarketAddress).trim()
    if (!targetAddress) {
      setValidateError('Please enter a Polymarket wallet address')
      return null
    }

    setValidateLoading(true)
    setValidateError(null)
    setValidateData(null)

    try {
      const res = await fetch('/api/turnkey/polymarket/validate-account', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ accountAddress: targetAddress }),
      })

      const data = (await res.json()) as ValidateResponse

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to validate account')
      }

      setValidateData(data)
      return data
    } catch (err: any) {
      setValidateError(err?.message || 'Failed to validate account')
      return null
    } finally {
      setValidateLoading(false)
    }
  }, [polymarketAddress])

  const fetchBalance = useCallback(async (addressOverride?: string) => {
    const targetAddress = (addressOverride ?? polymarketAddress).trim()
    if (!targetAddress) {
      setBalanceError('Enter a Polymarket wallet address first')
      setBalanceData(null)
      return null
    }

    setBalanceLoading(true)
    setBalanceError(null)
    setBalanceData(null)

    try {
      const res = await fetch('/api/turnkey/polymarket/usdc-balance', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ accountAddress: targetAddress }),
      })
      const data = (await res.json()) as BalanceResponse
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to fetch account value')
      }
      setBalanceData(data)
      return data
    } catch (err: any) {
      setBalanceError(err?.message || 'Failed to fetch account value')
      return null
    } finally {
      setBalanceLoading(false)
    }
  }, [polymarketAddress])

  const fetchOpenPositions = useCallback(async (addressOverride?: string) => {
    const targetAddress = (addressOverride ?? polymarketAddress).trim()
    if (!targetAddress) {
      setPositionsError('Enter a Polymarket wallet address first')
      setOpenPositionsCount(null)
      return null
    }

    setPositionsLoading(true)
    setPositionsError(null)
    setOpenPositionsCount(null)

    try {
      const res = await fetch(`/api/polymarket/open-positions?wallet=${targetAddress}`, {
        credentials: 'include',
        cache: 'no-store',
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to fetch open positions')
      }
      const count = typeof data?.open_positions === 'number' ? data.open_positions : 0
      setOpenPositionsCount(count)
      return count
    } catch (err: any) {
      setPositionsError(err?.message || 'Failed to fetch open positions')
      setOpenPositionsCount(null)
      return null
    } finally {
      setPositionsLoading(false)
    }
  }, [polymarketAddress])

  const generateL2Credentials = async (options?: { skipValidationCheck?: boolean }) => {
    if (!polymarketAddress.trim()) {
      setL2Error('Please enter and validate a Polymarket wallet address first')
      return null
    }

    if (!options?.skipValidationCheck && !validateData?.isContract && !linkStatus?.has_imported_key) {
      setL2Error('Please validate that the address is a contract wallet first')
      return null
    }

    setL2Loading(true)
    setL2Error(null)

    try {
      const res = await fetch('/api/polymarket/l2-credentials', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          polymarketAccountAddress: polymarketAddress,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to generate L2 credentials')
      }

      await loadLinkStatus()
      return data
    } catch (err: any) {
      setL2Error(err?.message || 'Failed to generate L2 credentials')
      return null
    } finally {
      setL2Loading(false)
    }
  }

  const openPolymarketExport = () => {
    // Open Polymarket's Magic Link key export page in a new tab
    window.open('https://reveal.magic.link/polymarket', '_blank', 'noreferrer')
  }

  const openPolymarketSite = () => {
    window.open('https://polymarket.com/', '_blank', 'noreferrer')
  }

  const resetProfileReview = () => {
    setEditingProfile(true)
    setAccountChecked(false)
    setValidateData(null)
    setBalanceData(null)
    setOpenPositionsCount(null)
    setValidateError(null)
    setBalanceError(null)
    setPositionsError(null)
    setActiveStage('profile')
  }

  const startImportFlow = async (): Promise<{
    walletId: string
    address: string
    alreadyImported?: boolean
  } | null> => {
    const trimmedKey = magicPrivateKey.trim()
    if (!trimmedKey) {
      setImportError('Paste your Magic private key (0x...) before importing')
      return null
    }
    if (!trimmedKey.startsWith('0x') || trimmedKey.length !== 66) {
      setImportError('Private key must start with 0x and be 66 chars long')
      return null
    }
    if (!polymarketAddress.trim()) {
      setImportError('Enter your Polymarket wallet address before importing')
      return null
    }
    if (!importBundle || !importOrgId || !importUserId) {
      setImportError('Import bundle not loaded. Please refresh and try again.')
      return null
    }

    setImportLoading(true)
    setImportError(null)

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
      } catch {
        throw new Error('Failed to parse encrypted bundle JSON from Turnkey SDK')
      }

      const res = await fetch('/api/turnkey/import-private-key', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          polymarket_account_address: polymarketAddress.trim(),
          encryptedBundle,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to import wallet')
      }

      await loadLinkStatus()
      return {
        walletId: data.walletId,
        address: data.address,
        alreadyImported: data.alreadyImported,
      }
    } catch (err: any) {
      setImportError(err?.message || 'Failed to import wallet')
      return null
    } finally {
      setImportLoading(false)
    }
  }

  const handleAccountCheck = useCallback(async (addressOverride?: string) => {
    const targetAddress = (addressOverride ?? polymarketAddress).trim()
    if (!targetAddress) {
      setValidateError('Please enter a Polymarket wallet address')
      setAccountChecked(false)
      return
    }

    setAccountChecked(false)
    setLinkingMessage(null)
    setLinkingError(null)

    const validation = await validateAccount(targetAddress)
    await fetchBalance(targetAddress)
    await fetchOpenPositions(targetAddress)

    if (validation?.isContract) {
      setAccountChecked(true)
      setEditingProfile(false)
    }
  }, [fetchBalance, fetchOpenPositions, polymarketAddress, validateAccount])

  const hasPolymarketAddress = Boolean(linkStatus?.polymarket_account_address)
  const hasL2Credentials = Boolean(linkStatus?.has_l2_credentials)
  const profileLinked = hasPolymarketAddress || accountChecked
  const profileReady = profileLinked && !editingProfile
  const tradingReady = hasL2Credentials
  const linkingInProgress = importLoading || l2Loading
  const checkingProfile = validateLoading || balanceLoading || positionsLoading
  const localAddressEntered = Boolean(polymarketAddress.trim())
  useEffect(() => {
    if (!profileReady && activeStage !== 'profile') {
      setActiveStage('profile')
    }
  }, [activeStage, profileReady])


  const handleLinkAccount = async () => {
    if (!TURNKEY_UI_ENABLED) {
      setImportError('Turnkey is disabled in this environment')
      return
    }

    if (!profileReady) {
      setImportError('Link your public profile before continuing')
      return
    }

    if (!polymarketAddress.trim()) {
      setImportError('Enter your Polymarket wallet address before linking')
      return
    }

    if (!magicPrivateKey.trim()) {
      setImportError('Paste your Magic private key before linking')
      return
    }

    setLinkingError(null)
    setLinkingMessage(null)

    const importResult = await startImportFlow()
    if (!importResult) {
      return
    }

    setLinkingMessage(
      importResult.alreadyImported
        ? 'Wallet already imported. Refreshing credentials...'
        : 'Magic key imported. Creating credentials...'
    )

    const credentials = await generateL2Credentials({ skipValidationCheck: true })
    if (!credentials) {
      setLinkingError('Failed to create Polymarket credentials')
      return
    }

    setLinkingMessage(
      credentials.isExisting
        ? 'Existing Polymarket credentials found and ready.'
      : 'Polymarket credentials generated successfully.'
    )
  }

  useEffect(() => {
    if (linkStatus?.polymarket_account_address && !autoCheckedAddress) {
      const address = linkStatus.polymarket_account_address
      setPolymarketAddress(address)
      handleAccountCheck(address)
      setAutoCheckedAddress(true)
      if (linkStatus.has_imported_key || linkStatus.has_l2_credentials) {
        setAccountChecked(true)
      }
    }
  }, [autoCheckedAddress, handleAccountCheck, linkStatus])

  return (
    <>
      <Navigation />
      <div className="max-w-xl mx-auto p-6 space-y-6">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
        {linkStatusError && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            ❌ {linkStatusError}
          </div>
        )}

        {!TURNKEY_UI_ENABLED && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Turnkey is disabled in this environment. Set the env vars to enable linking.
          </div>
        )}

        {activeStage === 'profile' ? (
          profileReady ? (
            <div className="space-y-4">
              <h1 className="text-2xl font-bold text-slate-900">Account linked</h1>
              <p className="text-sm text-slate-600">
                Your public Polymarket ID is saved. Continue to connect your private key or go back to change the address.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Account value</p>
                  <p className="text-2xl font-semibold text-slate-900 mt-2">
                    {balanceLoading ? 'Loading…' : balanceData?.usdcBalanceFormatted || '—'}
                  </p>
                  {balanceError && <p className="text-xs text-red-600 mt-1">{balanceError}</p>}
                </div>
                <div className="rounded-2xl border border-slate-200 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Open positions</p>
                  <p className="text-2xl font-semibold text-slate-900 mt-2">
                    {positionsLoading
                      ? 'Loading…'
                      : typeof openPositionsCount === 'number'
                        ? openPositionsCount
                        : '—'}
                  </p>
                  {positionsError && <p className="text-xs text-red-600 mt-1">{positionsError}</p>}
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={resetProfileReview}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-white"
                >
                  Back
                </button>
                <button
                  onClick={() => setActiveStage('key')}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  Next
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <h1 className="text-3xl font-bold text-slate-900">Link your Polymarket account</h1>
                <p className="text-sm text-slate-600 mt-2">Step one: Connect your public profile.</p>
                <p className="text-sm text-slate-500">Visit Polymarket and enter the code.</p>
              </div>

              <button
                onClick={openPolymarketSite}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-white"
              >
                Get my ID
              </button>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700">Polymarket address</label>
                <input
                  type="text"
                  value={polymarketAddress}
                  onChange={(e) => {
                    setPolymarketAddress(e.target.value)
                    setAccountChecked(false)
                  }}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 font-mono text-sm"
                  placeholder="0x..."
                />
              </div>

              {validateError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {validateError}
                </div>
              )}

              <button
                onClick={() => handleAccountCheck()}
                disabled={checkingProfile || !localAddressEntered}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 hover:bg-indigo-500"
              >
                {checkingProfile ? 'Linking…' : 'Link'}
              </button>
            </div>
          )
        ) : tradingReady ? (
          <div className="space-y-4">
            <h1 className="text-2xl font-bold text-slate-900">Account linked</h1>
            <p className="text-sm text-slate-600">Private key connected. You’re ready to trade.</p>
            <button
              onClick={() => setActiveStage('profile')}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-white"
            >
              Back
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <button
              onClick={() => setActiveStage('profile')}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-white w-fit"
            >
              Back
            </button>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Enter your private key</h1>
              <p className="text-sm text-slate-600 mt-2">Enter your private key in order to execute trading.</p>
            </div>

            <button
              onClick={openPolymarketExport}
              disabled={!TURNKEY_UI_ENABLED}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-60 hover:bg-white"
            >
              Open Magic Link process
            </button>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700">Magic private key (0x…)</label>
              <textarea
                value={magicPrivateKey}
                onChange={(e) => setMagicPrivateKey(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono text-sm"
                placeholder="Paste the key you copied"
                rows={3}
                disabled={!TURNKEY_UI_ENABLED}
              />
            </div>

            <button
              onClick={handleLinkAccount}
              disabled={!TURNKEY_UI_ENABLED || !magicPrivateKey.trim() || linkingInProgress}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 hover:bg-indigo-500"
            >
              {linkingInProgress ? 'Linking…' : 'Link'}
            </button>

            {(linkingError || importError || l2Error) && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 space-y-1">
                {linkingError && <p>❌ {linkingError}</p>}
                {!linkingError && importError && <p>❌ {importError}</p>}
                {!linkingError && l2Error && <p>❌ {l2Error}</p>}
              </div>
            )}

            {linkingMessage && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                ℹ️ {linkingMessage}
              </div>
            )}
          </div>
        )}
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
    </>
  )
}
