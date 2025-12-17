'use client'

import { useState } from 'react'
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

    if (!validateData?.isContract) {
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
    setImportLoading(true)
    setImportError(null)
    setImportData(null)

    let iframeContainer: HTMLDivElement | null = null

    try {
      // Step 1: Initialize import - get import bundle from backend
      console.log('[Import] Step 1: Initializing import...')
      
      const initRes = await fetch('/api/turnkey/import/init', {
        method: 'POST',
        credentials: 'include',
      })

      const initData = await initRes.json()

      if (!initRes.ok) {
        throw new Error(initData?.error || 'Failed to initialize import')
      }

      const { organizationId, privateKeyName, userId, importBundle } = initData

      console.log('[Import] Organization ID:', organizationId)
      console.log('[Import] Private key name:', privateKeyName)
      console.log('[Import] Import bundle obtained')

      // Step 2: Create Turnkey iframe client to inject the import bundle
      console.log('[Import] Step 2: Creating Turnkey iframe...')
      
      const { Turnkey } = await import('@turnkey/sdk-browser')
      const { IframeStamper } = await import('@turnkey/iframe-stamper')

      // Create iframe stamper
      const iframeStamper = new IframeStamper({
        iframeUrl: 'https://auth.turnkey.com',
        iframeContainer: document.body,
        iframeElementId: 'turnkey-import-iframe',
      })

      // Initialize the iframe
      await iframeStamper.init()
      
      console.log('[Import] Iframe initialized')

      // Create Turnkey SDK client with iframe stamper
      const turnkey = new Turnkey({
        apiBaseUrl: 'https://api.turnkey.com',
        defaultOrganizationId: organizationId,
        stamper: iframeStamper,
      })

      // Get iframe client to inject the import bundle
      const iframeClient = await turnkey.iframeClient({ iframeContainer: document.body, iframeElementId: 'turnkey-import-iframe' })

      // Inject the import bundle into the iframe
      console.log('[Import] Injecting import bundle into iframe...')
      const injected = await iframeClient.injectImportBundle(importBundle, organizationId, userId)

      if (!injected) {
        throw new Error('Failed to inject import bundle into iframe')
      }

      console.log('[Import] Import bundle injected successfully')

      // Step 3: Show UI modal around the iframe
      const iframeElement = document.getElementById('turnkey-import-iframe') as HTMLIFrameElement
      if (!iframeElement) {
        throw new Error('Turnkey iframe not found')
      }

      // Create modal UI
      iframeContainer = document.createElement('div')
      iframeContainer.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.9);
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
        backdrop-filter: blur(4px);
      `

      const modal = document.createElement('div')
      modal.style.cssText = `
        background: white;
        border-radius: 16px;
        padding: 32px;
        max-width: 700px;
        width: 90%;
        max-height: 90vh;
        overflow-y: auto;
        box-shadow: 0 25px 100px rgba(0,0,0,0.5);
      `

      const title = document.createElement('h2')
      title.textContent = '🔑 Import Private Key Securely'
      title.style.cssText = 'margin: 0 0 12px 0; font-size: 24px; font-weight: 700; color: #1a1a1a;'

      const subtitle = document.createElement('p')
      subtitle.innerHTML = `
        <strong style="color: #059669;">✅ Secure Turnkey Import</strong><br>
        Paste your Magic Link private key below.<br>
        <span style="color: #666; font-size: 13px;">Get it from: <a href="https://reveal.magic.link/polymarket" target="_blank">reveal.magic.link/polymarket</a></span>
      `
      subtitle.style.cssText = 'margin: 0 0 20px 0; font-size: 14px; line-height: 1.6; color: #333;'

      const securityNote = document.createElement('div')
      securityNote.innerHTML = `
        <strong>🔒 Security:</strong><br>
        • Your key is encrypted in this Turnkey iframe<br>
        • PolyCopy backend NEVER sees your plaintext key<br>
        • Key is transmitted directly to Turnkey's secure enclave
      `
      securityNote.style.cssText = 'margin: 0 0 20px 0; padding: 12px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; font-size: 13px; color: #166534; line-height: 1.6;'

      // Style the iframe
      iframeElement.style.cssText = 'width: 100%; height: 400px; border: 2px solid #e5e7eb; border-radius: 12px; background: #f9fafb; margin-bottom: 20px;'

      const buttonContainer = document.createElement('div')
      buttonContainer.style.cssText = 'display: flex; gap: 12px; justify-content: flex-end;'

      const cancelBtn = document.createElement('button')
      cancelBtn.textContent = 'Cancel'
      cancelBtn.style.cssText = `
        padding: 12px 24px;
        background: #ef4444;
        color: white;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        font-weight: 600;
        font-size: 14px;
      `
      cancelBtn.onclick = () => {
        if (iframeContainer) document.body.removeChild(iframeContainer)
        iframeStamper.clear()
        setImportLoading(false)
        setImportError('Import cancelled by user')
      }

      const completeBtn = document.createElement('button')
      completeBtn.textContent = 'Complete Import'
      completeBtn.style.cssText = `
        padding: 12px 24px;
        background: #10b981;
        color: white;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        font-weight: 600;
        font-size: 14px;
      `
      completeBtn.onclick = async () => {
        completeBtn.textContent = 'Processing...'
        completeBtn.disabled = true
        completeBtn.style.opacity = '0.6'

        try {
          // Wait a moment for Turnkey to process
          await new Promise(resolve => setTimeout(resolve, 2000))

          // Step 4: Complete import - query Turnkey and store reference
          console.log('[Import] Step 3: Completing import...')

          const completeRes = await fetch('/api/turnkey/import/complete', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ privateKeyName }),
          })

          const completeData = await completeRes.json()

          if (!completeRes.ok) {
            throw new Error(completeData?.error || 'Failed to complete import')
          }

          // Success!
          if (iframeContainer) document.body.removeChild(iframeContainer)
          iframeStamper.clear()
          setImportData(completeData)
          setImportLoading(false)
        } catch (err: any) {
          completeBtn.textContent = 'Retry'
          completeBtn.disabled = false
          completeBtn.style.opacity = '1'
          alert(`❌ ${err.message}\n\nMake sure you pasted your private key in the iframe above.`)
        }
      }

      buttonContainer.appendChild(cancelBtn)
      buttonContainer.appendChild(completeBtn)

      modal.appendChild(title)
      modal.appendChild(subtitle)
      modal.appendChild(securityNote)
      modal.appendChild(iframeElement)
      modal.appendChild(buttonContainer)
      iframeContainer.appendChild(modal)
      document.body.appendChild(iframeContainer)

      console.log('[Import] Import iframe UI ready - waiting for user to paste key...')
    } catch (err: any) {
      if (iframeContainer) {
        try {
          document.body.removeChild(iframeContainer)
        } catch (e) {
          // Iframe already removed
        }
      }
      setImportError(err?.message || 'Failed to import wallet')
      setImportLoading(false)
    }
  }


  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Turnkey Wallet MVP Tester</h1>
        <p className="text-slate-600 mt-2">
          Test wallet creation (idempotent) and message signing with Turnkey.
        </p>
      </div>

      {!TURNKEY_UI_ENABLED && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800">
          Set <code className="bg-amber-100 px-2 py-1 rounded">NEXT_PUBLIC_TURNKEY_ENABLED=true</code> in <code className="bg-amber-100 px-2 py-1 rounded">.env.local</code> to
          interact with this page. Backend also requires <code className="bg-amber-100 px-2 py-1 rounded">TURNKEY_ENABLED=true</code>.
        </div>
      )}

      {/* Step 1: Create Wallet */}
      <section className="rounded-lg border border-slate-200 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Step 1: Create/Retrieve Wallet</h2>
            <p className="text-sm text-slate-600">Idempotent operation - returns same wallet if already exists</p>
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
          <h2 className="text-xl font-semibold">Step 2: Sign Test Message</h2>
          <p className="text-sm text-slate-600">Sign a message and verify signature recovery</p>
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
              <div className={`rounded-md border p-4 ${
                verificationResult.success 
                  ? 'border-emerald-200 bg-emerald-50' 
                  : 'border-red-200 bg-red-50'
              }`}>
                <div className={`flex items-center gap-2 font-semibold ${
                  verificationResult.success ? 'text-emerald-800' : 'text-red-800'
                }`}>
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

      {/* Test Results Summary */}
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

      {/* STAGE 3: Polymarket Account Validation */}
      <section className="rounded-lg border border-purple-200 bg-purple-50 p-4 space-y-3">
        <div>
          <h2 className="text-xl font-semibold text-purple-900">Stage 3: Polymarket Account</h2>
          <p className="text-sm text-purple-700">Validate your Polymarket profile wallet address and check USDC balance</p>
        </div>

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

          <div className="flex gap-3">
            <button
              onClick={validateAccount}
              disabled={validateLoading || !TURNKEY_UI_ENABLED || !polymarketAddress.trim()}
              className="rounded-md bg-purple-600 px-4 py-2 text-white font-semibold disabled:opacity-60 hover:bg-purple-700 transition-colors"
            >
              {validateLoading ? 'Validating...' : 'Validate'}
            </button>

            {validateData?.isContract && (
              <button
                onClick={fetchBalance}
                disabled={balanceLoading || !TURNKEY_UI_ENABLED}
                className="rounded-md bg-emerald-600 px-4 py-2 text-white font-semibold disabled:opacity-60 hover:bg-emerald-700 transition-colors"
              >
                {balanceLoading ? 'Fetching...' : 'Fetch USDC Balance'}
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
          <div className={`rounded-md border p-4 ${
            validateData.isContract 
              ? 'border-emerald-200 bg-emerald-50' 
              : 'border-red-200 bg-red-50'
          }`}>
            <div className={`flex items-center gap-2 font-semibold ${
              validateData.isContract ? 'text-emerald-800' : 'text-red-800'
            }`}>
              {validateData.isContract 
                ? '✅ Contract wallet detected (Safe/proxy)' 
                : '❌ Not a contract. You probably pasted the wrong address.'}
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
      </section>

      {/* Import Wallet (Magic Link) */}
      <section className="rounded-lg border border-indigo-200 bg-indigo-50 p-4 space-y-3">
        <div>
          <h2 className="text-xl font-semibold text-indigo-900">Import Wallet (Magic Link Private Key)</h2>
          <p className="text-sm text-indigo-700">
            Securely import your Magic Link private key via Turnkey iframe.
            <br />
            <strong>Note:</strong> Your private key never touches PolyCopy servers - it goes directly to Turnkey.
          </p>
        </div>

        <div className="space-y-3">
          <button
            onClick={startImportFlow}
            disabled={importLoading || !TURNKEY_UI_ENABLED}
            className="rounded-md bg-indigo-600 px-4 py-2 text-white font-semibold disabled:opacity-60 hover:bg-indigo-700 transition-colors"
          >
            {importLoading ? 'Importing...' : 'Import Magic Link Key'}
          </button>

          <div className="text-xs text-indigo-600 border border-indigo-300 bg-white rounded p-2">
            ℹ️ <strong>MVP Note:</strong> Full Turnkey iframe integration requires @turnkey/iframe-stamper component.
            This demo uses manual walletId input for testing.
          </div>
        </div>

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

            <div className="border-t border-green-300 pt-2 mt-2">
              <p className="text-xs text-slate-600">
                🔒 <strong>Security:</strong> Your private key was imported directly to Turnkey and never exposed to PolyCopy.
              </p>
            </div>
          </div>
        )}
      </section>

      {/* Stage 4: Generate L2 CLOB Credentials */}
      <section className="rounded-lg border border-orange-200 bg-orange-50 p-4 space-y-3">
        <div>
          <h2 className="text-xl font-semibold text-orange-900">Stage 4: Generate L2 CLOB Credentials</h2>
          <p className="text-sm text-orange-700">Create API credentials for Polymarket CLOB trading (requires validated contract wallet)</p>
        </div>

        <div className="space-y-3">
          <button
            onClick={generateL2Credentials}
            disabled={l2Loading || !TURNKEY_UI_ENABLED || !validateData?.isContract}
            className="rounded-md bg-orange-600 px-4 py-2 text-white font-semibold disabled:opacity-60 hover:bg-orange-700 transition-colors"
          >
            {l2Loading ? 'Generating...' : 'Generate L2 Credentials'}
          </button>

          {!validateData?.isContract && (
            <p className="text-sm text-orange-700">
              ⚠️ Please validate a contract wallet address in Stage 3 first
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
                🔒 <strong>Security Note:</strong> API secret and passphrase are stored encrypted in the database and never exposed to the client.
              </p>
            </div>
          </div>
        )}
      </section>

      {/* Import Magic Link Wallet */}
      <section className="rounded-lg border border-indigo-200 bg-indigo-50 p-4 space-y-3">
        <div>
          <h2 className="text-xl font-semibold text-indigo-900">Import Magic Link Wallet</h2>
          <p className="text-sm text-indigo-700">Securely import your Magic Link private key via Turnkey iframe</p>
        </div>

        <div className="space-y-3">
          <div className="flex gap-3">
            <button
              onClick={openPolymarketExport}
              disabled={!TURNKEY_UI_ENABLED}
              className="rounded-md bg-purple-600 px-4 py-2 text-white font-semibold disabled:opacity-60 hover:bg-purple-700 transition-colors"
            >
              🔑 Open Polymarket Key Export (Magic)
            </button>

            <button
              onClick={startImportFlow}
              disabled={importLoading || !TURNKEY_UI_ENABLED}
              className="rounded-md bg-indigo-600 px-4 py-2 text-white font-semibold disabled:opacity-60 hover:bg-indigo-700 transition-colors"
            >
              {importLoading ? 'Importing...' : '➡️ Import to Turnkey'}
            </button>
          </div>

          <div className="text-xs text-indigo-600 border border-indigo-300 bg-white rounded p-2">
            <p className="font-semibold mb-1">📋 Instructions:</p>
            <ol className="list-decimal list-inside space-y-1 text-slate-700">
              <li>Click <strong>"Open Polymarket Key Export (Magic)"</strong> to open the Polymarket page in a new tab</li>
              <li>Copy the private key from the Polymarket page</li>
              <li>Return here and click <strong>"Import to Turnkey"</strong></li>
              <li>Follow the prompts to complete the secure import</li>
            </ol>
          </div>

          <div className="text-xs text-amber-600 border border-amber-300 bg-amber-50 rounded p-2">
            🔒 <strong>Security:</strong> Copy the private key from the Polymarket page and return here to import securely into Turnkey. Your key never touches PolyCopy servers.
          </div>
        </div>

        {importError && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-red-700">
            ❌ {importError}
          </div>
        )}

        {importData && (
          <div className="space-y-2 rounded-md border border-green-200 bg-green-50 p-4">
            <div className="flex items-center gap-2 text-green-800 font-semibold text-lg">
              ✅ Wallet Imported Successfully
            </div>
            
            <div className="space-y-2 text-sm">
              <div className="flex flex-col gap-1">
                <span className="font-semibold text-slate-700">Wallet ID:</span>
                <code className="bg-white px-2 py-1 border border-slate-200 rounded break-all text-xs font-mono">
                  {importData.walletId}
                </code>
              </div>

              <div className="flex flex-col gap-1">
                <span className="font-semibold text-slate-700">Address:</span>
                <code className="bg-white px-2 py-1 border border-slate-200 rounded break-all text-xs font-mono">
                  {importData.address}
                </code>
              </div>
            </div>

            <div className="border-t border-green-300 pt-2 mt-2">
              <p className="text-xs text-slate-600">
                🔒 <strong>Security Note:</strong> Your private key was imported securely via Turnkey's iframe. PolyCopy never saw your plaintext key.
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
