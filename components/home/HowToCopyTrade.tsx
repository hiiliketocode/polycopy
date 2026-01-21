'use client';

import { useState } from 'react';

export function HowToCopyTrade() {
  const [accountType, setAccountType] = useState<'free' | 'premium'>('free');

  const freeSteps = [
    {
      number: '1',
      title: 'Find a trade on your feed',
      description: 'Browse trades from traders you follow and find one you want to copy.',
      visual: (
        <div className="bg-white rounded-lg p-4 border-2 border-slate-200 h-[180px] flex flex-col">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700"></div>
            <div className="flex-1">
              <div className="font-semibold text-slate-900 text-sm">Bitcoin hits $100k</div>
              <div className="text-xs text-slate-500">by TopDog</div>
            </div>
          </div>
          <div className="mt-auto">
            <button className="w-full bg-[#FDB022] text-slate-900 py-2 rounded-lg font-bold text-sm">
              Copy Trade
            </button>
          </div>
        </div>
      )
    },
    {
      number: '2',
      title: 'Execute on Polymarket',
      description: 'Click "Copy Trade" to open the market on Polymarket. Execute your trade there, then return to Polycopy.',
      visual: (
        <div className="bg-slate-800 rounded-lg p-4 h-[180px] flex flex-col justify-center">
          <div className="text-center">
            <div className="text-4xl mb-3">🔗</div>
            <div className="text-sm font-semibold mb-1 text-white">Opens Polymarket</div>
            <div className="text-xs text-slate-400">Execute trade → Return here</div>
          </div>
        </div>
      )
    },
    {
      number: '3',
      title: 'Mark as copied',
      description: 'Click "Mark as Copied", input your trade amount, and we\'ll track it on your portfolio page.',
      visual: (
        <div className="bg-white rounded-lg p-4 border-2 border-slate-200 h-[180px] flex flex-col">
          <div className="text-sm font-semibold text-slate-900 mb-3">Mark Trade as Copied</div>
          <div className="mb-3">
            <label className="text-xs text-slate-600">Amount (USDC)</label>
            <input type="text" placeholder="100" className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm" />
          </div>
          <div className="mt-auto">
            <button className="w-full bg-slate-900 text-white py-2 rounded-lg font-semibold text-sm">
              Confirm
            </button>
          </div>
        </div>
      )
    }
  ];

  const premiumSteps = [
    {
      number: '1',
      title: 'Find a trade on your feed',
      description: 'Browse trades from traders you follow and find one you want to copy.',
      visual: (
        <div className="bg-white rounded-lg p-4 border-2 border-slate-200 h-[180px] flex flex-col">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700"></div>
            <div className="flex-1">
              <div className="font-semibold text-slate-900 text-sm">Bitcoin hits $100k</div>
              <div className="text-xs text-slate-500">by TopDog</div>
            </div>
          </div>
          <div className="mt-auto">
            <button className="w-full bg-[#FDB022] text-slate-900 py-2 rounded-lg font-bold text-sm">
              Copy Trade
            </button>
          </div>
        </div>
      )
    },
    {
      number: '2',
      title: 'Input your amount',
      description: 'Enter how much USDC you want to invest in this trade.',
      visual: (
        <div className="bg-white rounded-lg p-4 border-2 border-[#FDB022] h-[180px] flex flex-col">
          <div className="text-sm font-semibold text-slate-900 mb-3">Quick Copy</div>
          <div className="mb-3 flex-1">
            <label className="text-xs text-slate-600">Amount (USDC)</label>
            <input type="text" placeholder="100" className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm" />
          </div>
        </div>
      )
    },
    {
      number: '3',
      title: 'Execute instantly',
      description: 'Click "Execute Trade" and we\'ll place the order on Polymarket for you. Done!',
      visual: (
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-lg p-4 h-[180px] flex flex-col justify-center">
          <button className="w-full bg-[#FDB022] text-slate-900 py-3 rounded-lg font-bold mb-2">
            Execute Trade
          </button>
          <div className="text-center">
            <div className="text-green-400 text-xs font-semibold">✓ Trade Executed</div>
          </div>
        </div>
      )
    }
  ];

  const steps = accountType === 'free' ? freeSteps : premiumSteps;

  return (
    <div className="bg-slate-50 py-20 lg:py-32">
      <div className="max-w-7xl mx-auto px-6">
        <h2 className="text-4xl lg:text-5xl font-black text-slate-900 mb-6 text-center">
          How to copy trade on Polycopy
        </h2>
        <p className="text-xl text-slate-600 mb-12 text-center max-w-3xl mx-auto">
          Choose your account type to see how easy it is to copy trades
        </p>
        
        {/* Toggle */}
        <div className="flex justify-center mb-12">
          <div className="inline-flex items-center bg-white rounded-lg p-1 border-2 border-slate-200">
            <button
              onClick={() => setAccountType('free')}
              className={`px-6 py-2 rounded-md font-semibold transition-colors ${
                accountType === 'free' 
                  ? 'bg-[#FDB022] text-slate-900' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Free Account
            </button>
            <button
              onClick={() => setAccountType('premium')}
              className={`px-6 py-2 rounded-md font-semibold transition-colors ${
                accountType === 'premium' 
                  ? 'bg-gradient-to-r from-slate-900 to-slate-800 text-white' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Premium Account
            </button>
          </div>
        </div>
        
        {/* Steps */}
        <div className="grid lg:grid-cols-3 gap-8">
          {steps.map((step) => (
            <div key={step.number} className="bg-white rounded-2xl p-8 border-2 border-slate-200">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-slate-900 text-white flex items-center justify-center text-xl font-bold flex-shrink-0">
                  {step.number}
                </div>
                <h3 className="text-xl font-bold text-slate-900">{step.title}</h3>
              </div>
              <p className="text-slate-600 mb-6">{step.description}</p>
              <div className="mt-auto">
                {step.visual}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
