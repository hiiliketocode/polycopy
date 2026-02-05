'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowRight, Trophy, Vote, Bitcoin, Sparkles, Building2, TrendingUp, Laptop, Cloud, AlertCircle } from 'lucide-react';
import { Navigation } from '@/components/polycopy/navigation';
import { supabase } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';

export default function PolymarketMarketCategoriesPage() {
  const [user, setUser] = useState<User | null>(null);
  const [isPremium, setIsPremium] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        Promise.all([
          supabase.from('profiles').select('is_premium, profile_image_url').eq('id', session.user.id).single(),
          supabase.from('turnkey_wallets').select('polymarket_account_address, eoa_address').eq('user_id', session.user.id).maybeSingle()
        ]).then(([profileRes, walletRes]) => {
          setIsPremium(profileRes.data?.is_premium || false);
          setProfileImageUrl(profileRes.data?.profile_image_url || null);
          setWalletAddress(walletRes.data?.polymarket_account_address || walletRes.data?.eoa_address || null);
        });
      }
    });
  }, []);

  const categories = [
    {
      slug: 'sports-prediction-markets',
      title: 'Sports',
      icon: Trophy,
      color: 'emerald',
      description: 'NFL, NBA, Soccer, MLB, NHL, and more. Trade on game outcomes, championships, MVP awards, and player stats.',
      examples: ['Super Bowl winner', 'NBA MVP', 'World Cup champion', 'Team win totals'],
    },
    {
      slug: 'politics-prediction-markets',
      title: 'Politics',
      icon: Vote,
      color: 'blue',
      description: 'Presidential elections, Senate races, policy outcomes, and global political events.',
      examples: ['2028 Presidential election', 'Senate control', 'Supreme Court decisions', 'Ballot measures'],
    },
    {
      slug: 'crypto-prediction-markets',
      title: 'Crypto',
      icon: Bitcoin,
      color: 'orange',
      description: 'Bitcoin, Ethereum, altcoins, DeFi, NFTs, regulation, and blockchain technology.',
      examples: ['BTC to $100K?', 'ETH ETF approval', 'Token launches', 'Protocol upgrades'],
    },
    {
      slug: 'pop-culture-prediction-markets',
      title: 'Pop Culture',
      icon: Sparkles,
      color: 'pink',
      description: 'Entertainment, celebrities, awards shows, movies, TV, music, and viral trends.',
      examples: ['Oscars winners', 'Grammy predictions', 'Box office performance', 'Celebrity news'],
    },
    {
      slug: 'business-prediction-markets',
      title: 'Business',
      icon: Building2,
      color: 'indigo',
      description: 'Corporate earnings, IPOs, M&A, leadership changes, and company performance.',
      examples: ['Tech earnings', 'IPO success', 'CEO departures', 'Mergers & acquisitions'],
    },
    {
      slug: 'economics-prediction-markets',
      title: 'Economics',
      icon: TrendingUp,
      color: 'cyan',
      description: 'Fed policy, inflation, GDP growth, employment, interest rates, and macro trends.',
      examples: ['Fed rate decisions', 'Inflation targets', 'Recession odds', 'Jobs reports'],
    },
    {
      slug: 'tech-prediction-markets',
      title: 'Tech',
      icon: Laptop,
      color: 'violet',
      description: 'AI developments, product launches, tech company milestones, and industry trends.',
      examples: ['iPhone sales', 'AI breakthroughs', 'Product launches', 'Tech layoffs'],
    },
    {
      slug: 'weather-prediction-markets',
      title: 'Weather',
      icon: Cloud,
      color: 'sky',
      description: 'Temperature forecasts, hurricanes, snowfall, seasonal predictions, and climate events.',
      examples: ['Hurricane season', 'Snowfall totals', 'Record temperatures', 'El Niño/La Niña'],
    },
  ];

  return (
    <div className="min-h-screen bg-white">
      <Navigation 
        user={user ? { id: user.id, email: user.email || '' } : null} 
        isPremium={isPremium}
        walletAddress={walletAddress}
        profileImageUrl={profileImageUrl}
      />
      {/* Hero Section */}
      <section className="bg-gradient-to-b from-slate-50 to-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 py-16 md:py-24">
          <div className="text-center">
            <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-6">
              Polymarket Market Categories
            </h1>
            <p className="text-xl text-slate-600 mb-8 leading-relaxed max-w-3xl mx-auto">
              Polymarket has prediction markets for everything. Explore all categories, see what traders are profitable in each, and find your edge.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="https://polycopy.app">
                <Button size="lg" className="bg-polycopy-yellow hover:bg-polycopy-yellow/90 text-slate-900 font-semibold text-base px-8 h-12">
                  Start Following Traders
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>
              <Link href="/discover">
                <Button size="lg" variant="outline" className="font-semibold text-base px-8 h-12">
                  Browse All Markets
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Categories Grid */}
      <section className="py-16 md:py-20">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-12 text-center">
            Explore All Categories
          </h2>
          <div className="grid md:grid-cols-2 gap-8">
            {categories.map((category) => {
              const Icon = category.icon;
              return (
                <Link
                  key={category.slug}
                  href={`/${category.slug}`}
                  className="group bg-white rounded-2xl border-2 border-slate-200 hover:border-polycopy-yellow shadow-sm hover:shadow-lg transition-all p-8"
                >
                  <div className="flex items-start gap-4 mb-4">
                    <div className={`w-14 h-14 bg-${category.color}-100 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform`}>
                      <Icon className={`w-7 h-7 text-${category.color}-600`} />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-2xl font-bold text-slate-900 mb-2 group-hover:text-polycopy-yellow transition-colors">
                        {category.title}
                      </h3>
                      <p className="text-slate-600 leading-relaxed mb-4">
                        {category.description}
                      </p>
                    </div>
                  </div>
                  
                  <div className="bg-slate-50 rounded-lg p-4 mb-4">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                      Example Markets
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {category.examples.map((example, i) => (
                        <span
                          key={i}
                          className="text-sm text-slate-700 bg-white px-3 py-1 rounded-full border border-slate-200"
                        >
                          {example}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-polycopy-yellow font-semibold text-sm group-hover:gap-3 transition-all">
                    View {category.title} Traders
                    <ArrowRight className="w-4 h-4" />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* How to Choose */}
      <section className="py-16 md:py-20 bg-slate-50">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-12 text-center">
            How to Choose Your Category
          </h2>
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl border-l-4 border-emerald-500 shadow-sm">
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Follow What You Know</h3>
              <p className="text-slate-700 leading-relaxed">
                The best traders specialize in markets they deeply understand. If you follow the NFL religiously, start with sports. If you're a crypto native, trade crypto markets. Knowledge = edge.
              </p>
            </div>

            <div className="bg-white p-6 rounded-xl border-l-4 border-blue-500 shadow-sm">
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Test Multiple Categories</h3>
              <p className="text-slate-700 leading-relaxed">
                You don't have to pick one. Browse traders in 2-3 categories you're interested in. Follow the best performers in each and see where you're most successful.
              </p>
            </div>

            <div className="bg-white p-6 rounded-xl border-l-4 border-purple-500 shadow-sm">
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Copy Specialists</h3>
              <p className="text-slate-700 leading-relaxed">
                On Polycopy, you can follow traders who specialize in specific categories. A sports trader, a politics trader, a crypto trader - copy the best from each category.
              </p>
            </div>

            <div className="bg-white p-6 rounded-xl border-l-4 border-amber-500 shadow-sm">
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Start Small, Diversify Later</h3>
              <p className="text-slate-700 leading-relaxed">
                Begin with one category you understand well. Once you're profitable, expand to other categories. Depth first, breadth second.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pro Tips */}
      <section className="py-16 md:py-20">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-12 text-center">
            Category Trading Tips
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-emerald-50 border-l-4 border-emerald-500 p-6 rounded-r-xl">
              <h3 className="font-semibold text-slate-900 mb-2">Time-Sensitive Markets</h3>
              <p className="text-sm text-slate-700">
                Sports, weather, and some politics markets resolve quickly. If you want fast feedback, these are great categories to start with.
              </p>
            </div>

            <div className="bg-blue-50 border-l-4 border-blue-500 p-6 rounded-r-xl">
              <h3 className="font-semibold text-slate-900 mb-2">Long-Term Markets</h3>
              <p className="text-sm text-slate-700">
                Presidential elections, tech product success, crypto price targets - these take months or years to resolve. Good for patient traders.
              </p>
            </div>

            <div className="bg-purple-50 border-l-4 border-purple-500 p-6 rounded-r-xl">
              <h3 className="font-semibold text-slate-900 mb-2">High-Volume Categories</h3>
              <p className="text-sm text-slate-700">
                Sports and politics see the most trading activity. More liquidity = easier to enter and exit positions at good prices.
              </p>
            </div>

            <div className="bg-amber-50 border-l-4 border-amber-500 p-6 rounded-r-xl">
              <h3 className="font-semibold text-slate-900 mb-2">Niche Categories</h3>
              <p className="text-sm text-slate-700">
                Weather, economics, and some tech markets have fewer traders. If you have specialized knowledge, you can find mispricings more easily.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 md:py-20 bg-gradient-to-b from-slate-50 to-white border-t border-slate-200">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-6">
            Ready to Find Your Edge?
          </h2>
          <p className="text-xl text-slate-600 mb-4 leading-relaxed">
            Explore category pages, follow top traders in each, and start copying profitable strategies.
          </p>
          <p className="text-lg text-slate-600 mb-8 leading-relaxed">
            New to prediction markets? Start with our <Link href="/prediction-markets-for-beginners" className="text-polycopy-yellow hover:underline font-semibold">beginner's guide</Link>.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="https://polycopy.app">
              <Button size="lg" className="bg-polycopy-yellow hover:bg-polycopy-yellow/90 text-slate-900 font-semibold text-base px-8 h-12">
                Get Started Free
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
            <Link href="/best-polymarket-traders">
              <Button size="lg" variant="outline" className="font-semibold text-base px-8 h-12">
                View Top Traders
              </Button>
            </Link>
          </div>
          <p className="text-sm text-slate-500 mt-6">
            Free to browse all categories and traders. No credit card required.
          </p>
        </div>
      </section>

      {/* Disclaimer */}
      <section className="py-8 bg-slate-100 border-t border-slate-200">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-slate-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-slate-600 leading-relaxed">
              <strong>Not Financial Advice:</strong> Prediction market trading involves risk. Past performance does not guarantee future results. Different categories have different risks and complexities. Only trade with funds you can afford to lose.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
