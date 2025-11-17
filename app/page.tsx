'use client';

import { useState } from 'react';
import TraderCard from './components/TraderCard';

export default function Home() {
  const [selectedCategory, setSelectedCategory] = useState('All');

  const categories = ['All', 'Sports', 'Politics', 'Crypto'];

  // Featured traders data
  const featuredTraders = [
    {
      wallet: '0xabc123def456789abc123def456789abc123def4',
      displayName: 'polymarket_pro',
      pnl: 250000,
      winRate: 88.5,
      totalTrades: 445,
      isFollowing: false,
    },
    {
      wallet: '0xdef456789abc123def456789abc123def456789a',
      displayName: 'election_guru',
      pnl: 180000,
      winRate: 79.2,
      totalTrades: 312,
      isFollowing: false,
    },
    {
      wallet: '0x789xyz123abc456def789xyz123abc456def789x',
      displayName: 'sports_master',
      pnl: 95000,
      winRate: 75.8,
      totalTrades: 267,
      isFollowing: true,
    },
  ];

  // Test trader data
  const sampleTraders = [
    {
      wallet: '0xd7f85d0eb0fe0732ca38d9107ad0d4d01b1289e4',
      displayName: 'vitalik.eth',
      pnl: 45230,
      winRate: 72.5,
      totalTrades: 156,
      isFollowing: false,
    },
    {
      wallet: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
      displayName: '0x742d...0bEb',
      pnl: -2340,
      winRate: 45.2,
      totalTrades: 89,
      isFollowing: true,
    },
    {
      wallet: '0x1234567890abcdef1234567890abcdef12345678',
      displayName: 'crypto_whale',
      pnl: 128500,
      winRate: 81.3,
      totalTrades: 234,
      isFollowing: false,
    },
  ];

  return (
    <div className="min-h-screen bg-secondary pb-20">
      {/* Header */}
      <div className="bg-primary p-8 text-center">
        <h1 className="text-4xl font-bold text-tertiary">Polycopy</h1>
        <p className="text-tertiary">Follow the best Polymarket traders</p>
      </div>

      {/* Search Bar Section */}
      <div className="bg-secondary py-6 px-4 md:px-8">
        <div className="max-w-3xl mx-auto">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <span className="text-2xl">🔍</span>
            </div>
            <input
              type="text"
              placeholder="Search any Polymarket wallet or username..."
              className="w-full pl-14 pr-4 py-4 text-tertiary bg-white border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all duration-200 placeholder:text-gray-400"
            />
          </div>
        </div>
      </div>

      {/* Featured Traders Section */}
      <div className="bg-gradient-to-b from-gray-50 to-secondary py-8 px-4 md:px-8">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl font-bold text-tertiary mb-6">⭐ Featured Traders</h2>
          <div className="flex gap-6 overflow-x-auto snap-x snap-mandatory scrollbar-hide pb-4">
            {featuredTraders.map((trader) => (
              <div key={trader.wallet} className="min-w-[300px] md:min-w-[340px] snap-center">
                <TraderCard {...trader} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Category Filter Pills */}
      <div className="bg-secondary px-4 md:px-8 pb-4">
        <div className="max-w-6xl mx-auto">
          <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2">
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`
                  px-6 py-2.5 rounded-full font-medium whitespace-nowrap
                  transition-all duration-200 flex-shrink-0
                  ${
                    selectedCategory === category
                      ? 'bg-primary text-tertiary shadow-md'
                      : 'bg-white text-tertiary border-2 border-gray-300 hover:border-gray-400'
                  }
                `}
              >
                {category}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Featured Traders Section */}
      <div className="px-4 md:px-8 py-8">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl font-bold text-tertiary mb-6">Top Traders</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sampleTraders.map((trader) => (
              <TraderCard key={trader.wallet} {...trader} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}