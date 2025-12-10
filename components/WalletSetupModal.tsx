'use client';
import { useState, useEffect } from 'react';
import { useWalletSetup } from '@/hooks/useWalletSetup';

interface WalletSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (address: string) => void;
}

export default function WalletSetupModal({ isOpen, onClose, onSuccess }: WalletSetupModalProps) {
  // IMPORTANT: Call hooks BEFORE any conditional returns (Rules of Hooks)
  const { setupWallet, isCreating, error, walletAddress, authenticated } = useWalletSetup();
  const [step, setStep] = useState<'intro' | 'creating'>('intro');

  // Watch for wallet creation completion
  useEffect(() => {
    if (isOpen && step === 'creating' && !isCreating && walletAddress && authenticated) {
      // Wallet was created successfully
      // The hook will automatically reload the page, so we don't need to show success step
      onSuccess(walletAddress);
    }
  }, [isOpen, step, isCreating, walletAddress, authenticated, onSuccess]);

  // Watch for errors to go back to intro
  useEffect(() => {
    if (isOpen && error && step === 'creating') {
      setStep('intro');
    }
  }, [isOpen, error, step]);

  const handleSetup = () => {
    setStep('creating');
    setupWallet();
  };

  // Render nothing if modal is closed (after hooks are called)
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-xl max-w-md w-full p-6 border border-gray-800">
        {step === 'intro' && (
          <>
            <h2 className="text-xl font-bold text-white mb-4">Set Up Trading Wallet</h2>
            <p className="text-gray-400 mb-6">
              To copy trades automatically, you need a trading wallet. We'll create a secure wallet for you that works with Polymarket.
            </p>
            <ul className="text-sm text-gray-400 mb-6 space-y-2">
              <li className="flex items-start gap-2">
                <span className="text-yellow-500">✓</span>
                <span>Secure embedded wallet on Polygon</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-yellow-500">✓</span>
                <span>No browser extension needed</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-yellow-500">✓</span>
                <span>You control your keys</span>
              </li>
            </ul>
            {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 px-4 py-2 border border-gray-700 rounded-lg text-gray-400 hover:bg-gray-800">
                Later
              </button>
              <button onClick={handleSetup} className="flex-1 px-4 py-2 bg-yellow-500 text-black rounded-lg font-medium hover:bg-yellow-600">
                Create Wallet
              </button>
            </div>
          </>
        )}

        {step === 'creating' && (
          <div className="text-center py-8">
            <div className="animate-spin w-12 h-12 border-4 border-yellow-500 border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-white font-medium">Creating your wallet...</p>
            <p className="text-gray-400 text-sm mt-2">This may take a moment</p>
          </div>
        )}
      </div>
    </div>
  );
}
