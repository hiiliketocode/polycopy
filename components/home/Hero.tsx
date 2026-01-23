'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export function Hero() {
  const confettiRef = useRef<any>(null);

  useEffect(() => {
    // Load confetti only on client side
    import('canvas-confetti').then((module) => {
      confettiRef.current = module.default;
    });
  }, []);

  const handleCopyTrade = (e: React.MouseEvent<HTMLButtonElement>) => {
    console.log('Copy trade clicked, confetti loaded:', !!confettiRef.current);
    
    if (!confettiRef.current) {
      console.error('Confetti not loaded yet');
      // Try loading it again
      import('canvas-confetti').then((module) => {
        confettiRef.current = module.default;
        if (confettiRef.current) {
          triggerConfetti(e);
        }
      });
      return;
    }
    
    triggerConfetti(e);
  };
  
  const triggerConfetti = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!confettiRef.current) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (rect.left + rect.width / 2) / window.innerWidth;
    const y = (rect.top + rect.height / 2) / window.innerHeight;
    
    confettiRef.current({
      particleCount: 100,
      spread: 70,
      origin: { x, y },
      colors: ['#FDB022', '#F59E0B', '#FBBF24', '#FCD34D']
    });
  };

  return (
    <div className="relative bg-slate-50 overflow-hidden">
      {/* Auth buttons - top right */}
      <div className="absolute top-4 right-6 z-30 flex items-center gap-3">
        <Link href="/login">
          <Button variant="ghost" className="text-slate-700 hover:text-slate-900">
            Sign In
          </Button>
        </Link>
        <Link href="/login?mode=signup">
          <Button className="bg-[#FDB022] text-slate-900 hover:bg-yellow-400 font-bold">
            Sign Up
          </Button>
        </Link>
      </div>

      {/* Desktop Layout */}
      <div className="hidden lg:block">
        <div className="max-w-7xl mx-auto px-6 py-12 lg:py-20">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left: Text content */}
            <div>
              <div className="mb-6">
                <Image 
                  src="/logos/polycopy-logo-primary.svg" 
                  alt="Polycopy" 
                  width={160}
                  height={40}
                  className="h-10 w-auto"
                  priority
                />
              </div>
              <h1 className="text-5xl lg:text-6xl font-black text-slate-900 mb-6 leading-tight">
                Your curated feed of winning Polymarket trades
              </h1>
              <p className="text-xl text-slate-600 mb-8">
                Stop drowning in endless trader lists. Follow who you trust, filter what you need, copy what you love.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link href="/login?mode=signup">
                  <Button 
                    size="lg"
                    className="bg-slate-900 text-white px-8 py-6 text-lg font-bold hover:bg-slate-800"
                  >
                    Start For Free
                  </Button>
                </Link>
              </div>
            </div>
            
            {/* Right: Animated Cards Container */}
            <div className="relative h-[600px]" style={{ perspective: '1000px' }}>
              {/* Background Floating Cards */}
              <FloatingCards />
              
              {/* Main Trade Card - CENTER STAGE */}
              <div className="absolute inset-0 flex items-center justify-center z-20">
                <FeaturedTradeCard onCopyTrade={handleCopyTrade} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Layout */}
      <div className="lg:hidden">
        <div className="px-6 py-12 pt-12">
          <div className="mb-4">
            <Image 
              src="/logos/polycopy-logo-primary.svg" 
              alt="Polycopy" 
              width={128}
              height={32}
              className="h-8 w-auto"
              priority
            />
          </div>
          <h1 className="text-4xl font-black text-slate-900 mb-4 leading-tight">
            Your curated feed of winning Polymarket trades
          </h1>
          <p className="text-base text-slate-600 mb-6">
            Stop drowning in endless trader lists. Follow who you trust, filter what you need, copy what you love.
          </p>
          
          {/* Featured Card - More prominent on mobile */}
          <div className="mb-6">
            <FeaturedTradeCard onCopyTrade={handleCopyTrade} />
          </div>
          
          <div className="flex flex-col gap-3">
            <Link href="/login?mode=signup" className="w-full">
              <Button 
                size="lg"
                className="bg-slate-900 text-white px-6 py-3 font-bold w-full"
              >
                Start For Free
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// Floating Cards Component (Desktop Only)
function FloatingCards() {
  const cards = [
    // Top arc
    { name: 'CryptoWhale', roi: '+45% ROI', market: 'BTC $120k June?', gradient: 'from-amber-500 to-yellow-600', top: '5%', left: '5%', delay: '0s' },
    { name: 'PoliPredictor', roi: '+68% ROI', market: 'Fed cuts 50bps?', gradient: 'from-purple-500 to-indigo-600', top: '0%', left: '50%', transform: 'translateX(-50%)', delay: '2s' },
    { name: 'SportsKing', roi: '+52% ROI', market: 'Seahawks SB?', gradient: 'from-blue-500 to-blue-800', top: '5%', right: '5%', delay: '4s' },
    
    // Middle sides
    { name: 'TechOracle', roi: '+73% ROI', market: 'Apple AI Q2?', gradient: 'from-green-500 to-emerald-700', top: '30%', left: '-5%', delay: '1.5s' },
    { name: 'AIBull', roi: '+91% ROI', market: 'GPT-5 summer?', gradient: 'from-indigo-600 to-indigo-800', top: '55%', left: '-2%', delay: '2.5s' },
    { name: 'RateFiend', roi: '+63% ROI', market: 'Recession 2026?', gradient: 'from-red-600 to-red-900', top: '22%', right: '-8%', delay: '4.5s' },
    { name: 'MarketMaven', roi: '+61% ROI', market: 'Netflix Q1?', gradient: 'from-amber-500 to-orange-700', top: '45%', right: '-10%', delay: '3.5s' },
    { name: 'StableCoin', roi: '+48% ROI', market: 'USDC de-peg?', gradient: 'from-sky-500 to-blue-700', top: '68%', right: '-5%', delay: '5.5s' },
    
    // Bottom arc
    { name: 'PropBetter', roi: '+84% ROI', market: 'Lakers playoffs?', gradient: 'from-pink-500 to-rose-700', bottom: '5%', left: '8%', delay: '5s' },
    { name: 'GlobalTrader', roi: '+56% ROI', market: 'Tariffs April?', gradient: 'from-teal-500 to-teal-700', bottom: '0%', left: '50%', transform: 'translateX(-50%)', delay: '6.5s' },
    { name: 'EthMaxi', roi: '+79% ROI', market: 'ETH $5k May 31?', gradient: 'from-amber-400 to-yellow-600', bottom: '5%', right: '8%', delay: '7.5s' },
  ];

  return (
    <>
      <style jsx>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px) rotateY(0deg); }
          50% { transform: translateY(-20px) rotateY(5deg); }
        }
        .floating-card {
          animation: float 8s ease-in-out infinite;
        }
      `}</style>
      {cards.map((card, index) => (
        <div
          key={index}
          className="floating-card absolute w-44 bg-white rounded-xl p-3 shadow-lg border-2 border-slate-200 z-1"
          style={{
            top: card.top,
            bottom: card.bottom,
            left: card.left,
            right: card.right,
            transform: card.transform,
            animationDelay: card.delay
          } as React.CSSProperties}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className={`w-6 h-6 rounded-md bg-gradient-to-br ${card.gradient}`}></div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-slate-900 text-xs truncate">{card.name}</div>
              <div className="text-xs text-green-600">{card.roi}</div>
            </div>
          </div>
          <div className="text-xs text-slate-600 line-clamp-2">{card.market}</div>
        </div>
      ))}
    </>
  );
}

// Featured Trade Card Component
function FeaturedTradeCard({ onCopyTrade }: { onCopyTrade: (e: React.MouseEvent<HTMLButtonElement>) => void }) {
  return (
    <div className="bg-white rounded-2xl shadow-2xl border-2 border-slate-200 p-6 w-full max-w-md">
      <div className="flex items-center gap-3 mb-4 pb-4 border-b border-slate-200">
        <span className="font-bold text-slate-900 text-sm">Your Feed</span>
        <div className="ml-auto">
          <span className="text-xs bg-orange-100 text-orange-700 px-3 py-1 rounded-full font-semibold">
            Crypto
          </span>
        </div>
      </div>
      
      <div className="bg-white border-2 border-slate-200 rounded-xl p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700"></div>
          <div className="flex-1">
            <div className="font-semibold text-slate-900 text-base mb-1">Bitcoin hits $100k</div>
            <div className="text-sm text-slate-500">by TopDog</div>
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <div className="text-xs text-slate-500 uppercase font-medium mb-1">Action</div>
            <div className="text-base font-bold text-green-600">Buy Yes</div>
          </div>
          <div>
            <div className="text-xs text-slate-500 uppercase font-medium mb-1">Price</div>
            <div className="text-base font-bold text-slate-900">$0.72</div>
          </div>
        </div>
        
        <button 
          onClick={onCopyTrade}
          className="w-full bg-[#FDB022] hover:bg-yellow-400 text-slate-900 py-3 px-4 rounded-xl font-bold text-base transition-colors"
        >
          Copy Trade
        </button>
      </div>
    </div>
  );
}
