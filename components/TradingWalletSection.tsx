'use client';
import { useFundWallet } from '@privy-io/react-auth';
import { useState, useEffect } from 'react';

interface TradingWalletSectionProps {
  walletAddress: string;
  onSetupClick: () => void;
}

export default function TradingWalletSection({ walletAddress, onSetupClick }: TradingWalletSectionProps) {
  const { fundWallet } = useFundWallet();
  const [walletBalance, setWalletBalance] = useState<string | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  // Abbreviate wallet address
  const abbreviateWallet = (address: string): string => {
    if (!address || address.length < 10) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  // Show toast helper
  const showToastMessage = (message: string) => {
    setToastMessage(message);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  // Fetch USDC.e balance
  useEffect(() => {
    const fetchBalance = async () => {
      if (!walletAddress) {
        setWalletBalance(null);
        return;
      }

      setLoadingBalance(true);
      try {
        // Query USDC.e balance on Polygon
        const USDC_E_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
        const response = await fetch(
          `https://api.polygonscan.com/api?module=account&action=tokenbalance&contractaddress=${USDC_E_ADDRESS}&address=${walletAddress}&tag=latest&apikey=YourApiKeyToken`
        );
        const data = await response.json();
        
        if (data.status === '1' && data.result) {
          // USDC.e has 6 decimals
          const balance = (parseInt(data.result) / 1000000).toFixed(2);
          setWalletBalance(balance);
        }
      } catch (err) {
        console.error('Error fetching balance:', err);
      } finally {
        setLoadingBalance(false);
      }
    };

    fetchBalance();
  }, [walletAddress]);

  // Handle deposit using Privy's fundWallet
  const handleDeposit = async () => {
    try {
      await fundWallet({ address: walletAddress });
    } catch (error) {
      console.error('Deposit error:', error);
      showToastMessage('Failed to open deposit');
    }
  };

  // Handle withdraw
  const handleWithdraw = async () => {
    try {
      // Privy's fundWallet also handles withdrawals
      await fundWallet({ address: walletAddress });
    } catch (error) {
      console.error('Withdraw error:', error);
      showToastMessage('Failed to open withdraw');
    }
  };

  // If no wallet address, show setup button
  if (!walletAddress) {
    return (
      <div className="mt-4 p-4 bg-slate-800/50 rounded-lg border border-slate-700 text-center">
        <p className="text-sm text-slate-400 mb-3">
          Set up your trading wallet to start copy trading automatically
        </p>
        <button
          onClick={onSetupClick}
          className="px-4 py-2 bg-[#FDB022] hover:bg-[#E69E1A] text-black rounded-lg font-medium transition-colors text-sm"
        >
          Set Up Trading Wallet
        </button>
      </div>
    );
  }

  // Show wallet details
  return (
    <>
      <div className="mt-4 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
        <h3 className="text-sm font-medium text-slate-400 mb-3">Trading Wallet</h3>
        
        {/* Wallet Address */}
        <div className="flex items-center gap-2 mb-3">
          <span className="font-mono text-sm text-white">
            {abbreviateWallet(walletAddress)}
          </span>
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(walletAddress);
                showToastMessage('Address copied!');
              } catch (err) {
                console.error('Failed to copy:', err);
              }
            }}
            className="text-slate-400 hover:text-white transition-colors"
            title="Copy address"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>
        </div>

        {/* Balance */}
        <div className="mb-3">
          <p className="text-xs text-slate-500 mb-1">USDC.e Balance</p>
          {loadingBalance ? (
            <div className="h-6 w-20 bg-slate-700 animate-pulse rounded"></div>
          ) : (
            <p className="text-lg font-semibold text-white">
              ${walletBalance || '0.00'}
            </p>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <button
            onClick={handleDeposit}
            className="flex-1 px-4 py-2 bg-[#FDB022] hover:bg-[#E69E1A] text-black rounded-lg font-medium transition-colors text-sm"
          >
            Deposit
          </button>
          <button
            onClick={handleWithdraw}
            className="flex-1 px-4 py-2 border border-slate-600 hover:bg-slate-700 text-white rounded-lg font-medium transition-colors text-sm"
          >
            Withdraw
          </button>
        </div>
        
        <p className="text-xs text-slate-500 mt-2">
          Powered by Privy • Polygon Network
        </p>
      </div>

      {/* Toast Notification */}
      {showToast && (
        <div className="fixed bottom-20 left-1/2 transform -translate-x-1/2 bg-slate-800 text-white px-4 py-2 rounded-lg shadow-lg z-50">
          {toastMessage}
        </div>
      )}
    </>
  );
}
