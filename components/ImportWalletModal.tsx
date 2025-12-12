'use client';

import { useState } from 'react';
import { Wallet } from '@ethersproject/wallet';

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

      // Validate the private key by creating a wallet instance
      // This happens CLIENT-SIDE only for validation
      let walletAddress: string;
      try {
        const wallet = new Wallet(formattedKey);
        walletAddress = wallet.address;
      } catch (error) {
        throw new Error('Invalid private key. Please check and try again.');
      }

      // Save only the wallet ADDRESS to our database (not the private key!)
      const { supabase } = await import('@/lib/supabase');
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('You must be logged in');
      }

      const response = await fetch('/api/wallet/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          walletAddress // Only send the address (public info)
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save wallet address');
      }

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
        <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
          Import Your Polymarket Wallet
        </h2>
        
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

        {/* Security Warning */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4">
          <div className="flex items-start gap-2">
            <span className="text-blue-600 dark:text-blue-400 text-xl">🔒</span>
            <div className="text-sm text-blue-800 dark:text-blue-200">
              <p className="font-semibold mb-1">Privacy & Security:</p>
              <p>
                Your private key is validated locally in your browser to verify your wallet address. 
                We only store your public wallet address - your private key is never sent to our servers.
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
            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg font-mono text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#FDB022] focus:border-transparent"
            autoComplete="off"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Starts with 0x followed by 64 hexadecimal characters
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
            className="flex-1 px-4 py-2.5 bg-[#FDB022] text-black rounded-lg font-semibold hover:bg-[#E69E1A] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin">⏳</span>
                Importing...
              </span>
            ) : (
              'Import Wallet'
            )}
          </button>
        </div>

        {/* Additional Help */}
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Need help?{' '}
            <a 
              href="https://docs.polymarket.com" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 hover:underline"
            >
              View Polymarket documentation
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
