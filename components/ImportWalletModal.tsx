'use client';

import { useState } from 'react';

interface ImportWalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (address: string) => void;
}

export default function ImportWalletModal({ isOpen, onClose, onSuccess }: ImportWalletModalProps) {
  const [privateKey, setPrivateKey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleImport = async () => {
    setError('');
    setLoading(true);

    try {
      // Format the private key
      let formattedKey = privateKey.trim();
      if (!formattedKey.startsWith('0x')) {
        formattedKey = '0x' + formattedKey;
      }

      // Validate format (0x + 64 hex characters = 66 total)
      if (formattedKey.length !== 66) {
        throw new Error('Private key must be 66 characters (0x + 64 hex characters)');
      }

      if (!/^0x[a-fA-F0-9]{64}$/.test(formattedKey)) {
        throw new Error('Private key must contain only hexadecimal characters (0-9, a-f)');
      }

      // Derive wallet address locally (never sent to our servers!)
      const { Wallet } = await import('@ethersproject/wallet');
      const wallet = new Wallet(formattedKey);
      const walletAddress = wallet.address;

      console.log('✅ Wallet validated locally:', walletAddress);

      // Save only the PUBLIC wallet address to our database
      // The private key stays in your browser and is never sent to our servers
      const response = await fetch('/api/wallet/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          walletAddress  // Only public address!
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save wallet address');
      }

      console.log('✅ Wallet address saved');

      // Clear the private key input for security
      setPrivateKey('');
      
      // Call success callback with the wallet address
      onSuccess(walletAddress);
      
    } catch (err: any) {
      console.error('Import error:', err);
      setError(err.message || 'Invalid private key. Please check and try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
        
        {/* Turnkey Branding Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            Import Wallet
          </h2>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>Secured by</span>
            <div className="bg-slate-900 text-white px-3 py-1 rounded-full font-semibold">
              Turnkey
            </div>
          </div>
        </div>
        
        {/* Instructions */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4">
          <p className="font-semibold mb-3 text-gray-900 dark:text-white">
            How to get your private key:
          </p>
          <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li>
              Go to{' '}
              <a 
                href="https://polymarket.com" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 underline hover:text-blue-700"
              >
                Polymarket.com
              </a>
            </li>
            <li>Click your profile icon → Settings</li>
            <li>Look for "Export Private Key" or "Reveal Private Key"</li>
            <li>Copy the key and paste it below</li>
          </ol>
        </div>

        {/* Security Assurance - Prominently display Turnkey's role */}
        <div className="bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 border-2 border-purple-200 dark:border-purple-800 rounded-xl p-5 mb-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-purple-600 rounded-full flex items-center justify-center flex-shrink-0">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className="font-bold text-gray-900 dark:text-white">Client-Side Validation Only</span>
                <span className="bg-green-600 text-white text-xs px-2 py-0.5 rounded-full font-semibold">100% Private</span>
              </div>
              <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
                Your private key is <strong>validated in your browser</strong> and <strong>never sent to Polycopy's servers</strong>. 
                We only save your public wallet address (which is public information anyway, like your email).
              </p>
              <div className="bg-white/50 dark:bg-black/20 rounded-lg p-3 text-xs space-y-2">
                <div className="flex items-start gap-2">
                  <span className="text-green-600 dark:text-green-400 font-bold mt-0.5">✓</span>
                  <span><strong>Validated Locally:</strong> Your browser verifies the private key format</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-green-600 dark:text-green-400 font-bold mt-0.5">✓</span>
                  <span><strong>Address Extracted:</strong> Public address (0x...) is derived from the key</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-green-600 dark:text-green-400 font-bold mt-0.5">✓</span>
                  <span><strong>Private Key Discarded:</strong> After validation, the key never leaves your device</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-blue-600 dark:text-blue-400 font-bold mt-0.5">→</span>
                  <span><strong>Only Address Saved:</strong> We store only your public address in our database</span>
                </div>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-3">
                <a 
                  href="/faq#wallet-security" 
                  className="underline hover:text-slate-800 dark:hover:text-slate-200 font-semibold"
                >
                  Learn more about our security →
                </a>
              </p>
            </div>
          </div>
        </div>

        {/* Input */}
        <div className="mb-4">
          <label className="block mb-2 text-sm font-medium text-gray-900 dark:text-white">
            Private Key <span className="text-red-500">*</span>
          </label>
          <input
            type="password"
            value={privateKey}
            onChange={(e) => {
              setPrivateKey(e.target.value);
              setError(''); // Clear error when user types
            }}
            placeholder="0x... or paste your private key"
            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg font-mono text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            autoComplete="off"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            66 characters total: 0x + 64 hexadecimal characters
          </p>
        </div>

        {/* Error Display */}
        {error && (
          <div className="text-red-600 dark:text-red-400 text-sm mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 rounded-lg">
            {error}
          </div>
        )}

        {/* Buttons */}
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={!privateKey.trim() || loading}
            className="flex-1 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-purple-500/30"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin">⏳</span>
                Importing...
              </span>
            ) : (
              'Import Wallet Securely'
            )}
          </button>
        </div>

        {/* Trust Indicators */}
        <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-center gap-4 text-xs text-gray-500 dark:text-gray-400">
            <div className="flex items-center gap-1">
              <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <span>Client-side only</span>
            </div>
            <div className="flex items-center gap-1">
              <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <span>Never sent to servers</span>
            </div>
            <div className="flex items-center gap-1">
              <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <a href="/faq#wallet-security" className="underline hover:text-gray-700 dark:hover:text-gray-300">Learn more</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
