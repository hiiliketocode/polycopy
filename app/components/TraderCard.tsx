'use client';

import { useState } from 'react';

interface TraderCardProps {
  wallet: string;
  displayName: string;
  pnl: number;
  winRate: number;
  totalTrades: number;
  isFollowing: boolean;
}

export default function TraderCard({
  wallet,
  displayName,
  pnl,
  winRate,
  totalTrades,
  isFollowing,
}: TraderCardProps) {
  const [copied, setCopied] = useState(false);
  const [following, setFollowing] = useState(isFollowing);

  // Generate consistent color from wallet address
  const getAvatarColor = (address: string) => {
    let hash = 0;
    for (let i = 0; i < address.length; i++) {
      hash = address.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = hash % 360;
    return `hsl(${hue}, 65%, 50%)`;
  };

  // Abbreviate wallet address
  const abbreviateWallet = (address: string) => {
    if (address.length < 10) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  // Format P&L with sign and currency
  const formatPnL = (value: number) => {
    const sign = value >= 0 ? '+' : '';
    return `${sign}$${value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  // Copy wallet to clipboard
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(wallet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // Toggle follow status
  const handleFollowToggle = () => {
    setFollowing(!following);
    // TODO: Add API call to update follow status
  };

  const avatarColor = getAvatarColor(wallet);
  const initials = wallet.slice(2, 4).toUpperCase();

  return (
    <div className="bg-white rounded-2xl shadow-md hover:shadow-lg transition-all duration-200 p-6 border border-gray-100">
      {/* Top Section: Avatar and Name */}
      <div className="flex items-start gap-4 mb-4">
        {/* Avatar */}
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-lg flex-shrink-0"
          style={{ backgroundColor: avatarColor }}
        >
          {initials}
        </div>

        {/* Name and Wallet */}
        <div className="flex-1 min-w-0">
          <h3 className="text-xl font-bold text-tertiary mb-1 truncate">
            {displayName}
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500 font-mono">
              {abbreviateWallet(wallet)}
            </span>
            <button
              onClick={handleCopy}
              className="text-gray-400 hover:text-tertiary transition-colors"
              title="Copy wallet address"
            >
              {copied ? '✓' : '📋'}
            </button>
          </div>
        </div>
      </div>

      {/* Stats Section */}
      <div className="grid grid-cols-3 gap-3 mb-5 py-4 border-t border-b border-gray-100">
        <div className="text-center">
          <div className={`text-lg font-bold ${pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {formatPnL(pnl)}
          </div>
          <div className="text-xs text-gray-500 mt-1">P&L</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-tertiary">
            {winRate.toFixed(1)}%
          </div>
          <div className="text-xs text-gray-500 mt-1">Win Rate</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-tertiary">
            {totalTrades}
          </div>
          <div className="text-xs text-gray-500 mt-1">Trades</div>
        </div>
      </div>

      {/* Follow Button */}
      <button
        onClick={handleFollowToggle}
        className={`w-full py-3 px-4 rounded-xl font-semibold transition-all duration-200 ${
          following
            ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            : 'bg-primary text-tertiary hover:bg-yellow-400'
        }`}
      >
        {following ? '✓ Following' : '+ Follow'}
      </button>
    </div>
  );
}

