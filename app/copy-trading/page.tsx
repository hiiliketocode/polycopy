'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Navigation } from '@/components/polycopy/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { 
  ArrowRight, 
  TrendingUp, 
  Users, 
  Target, 
  Zap,
  CheckCircle2,
  Clock,
  BarChart3,
  Shield,
  ChevronDown,
  Play
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getTraderAvatarInitials } from '@/lib/trader-name';

interface TopTrader {
  wallet_address: string;
  display_name: string | null;
  profile_image: string | null;
  pnl: number;
  volume: number;
  total_trades: number;
  win_rate: number | null;
  follower_count: number;
}

export default function CopyTradingPage() {
  const [topTraders, setTopTraders] = useState<TopTrader[]>([]);
  const [loading, setLoading] = useState(true);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);

  useEffect(() => {
    async function fetchTopTraders() {
      const { data, error } = await supabase
        .from('traders')
        .select('wallet_address, display_name, profile_image, pnl, volume, total_trades, win_rate, follower_count')
        .order('pnl', { ascending: false })
        .limit(3);

      if (data && !error) {
        setTopTraders(data);
      }
      setLoading(false);
    }

    fetchTopTraders();
  }, []);

  const faqs = [
    {
      question: "What is copy trading?",
      answer: "Copy trading is a strategy where you automatically replicate the trades of experienced traders. On Polycopy, you can follow top Polymarket traders and copy their prediction market positions with just a few clicks. Think of it like following an investment portfolio, but for prediction markets."
    },
    {
      question: "Is copy trading legal?",
      answer: "Yes, copy trading is completely legal. You maintain full control of your funds at all times and can start or stop copying whenever you want. Polycopy connects to your wallet with your explicit permission to execute trades on your behalf. You're not giving us your funds - just permission to place trades."
    },
    {
      question: "How much does copy trading cost?",
      answer: "Polycopy offers a free plan where you can manually copy trades - you'll get notifications when traders make moves and can execute them yourself on Polymarket. Premium plans include automatic trade execution, real-time WhatsApp notifications, and advanced analytics. Check our pricing page for current rates."
    },
    {
      question: "Can I stop copying a trader anytime?",
      answer: "Absolutely. You can unfollow traders, pause copy trading, or disconnect your wallet at any time with one click. You're in complete control of who you follow and when."
    },
    {
      question: "Do I need to connect my wallet to copy trades?",
      answer: "For manual copying (free plan), you don't need to connect your wallet - you'll just receive trade alerts and execute them yourself on Polymarket. For automatic copying (Premium), you'll need to securely connect your wallet so Polycopy can execute trades on your behalf."
    },
    {
      question: "How do I choose which traders to copy?",
      answer: "Polycopy provides detailed performance metrics for every trader including ROI, win rate, total profit, and trade history. You can filter traders by category (sports, politics, crypto), sort by performance, and see their recent trades before deciding to follow them."
    }
  ];

  const benefits = [
    {
      icon: Clock,
      title: "Save Time on Research",
      description: "Skip hours of market analysis. Follow traders who've already done the work and proven their strategies."
    },
    {
      icon: TrendingUp,
      title: "Learn from Proven Strategies",
      description: "See exactly what winning traders are betting on and learn their approach to prediction markets."
    },
    {
      icon: Target,
      title: "Diversify Your Portfolio",
      description: "Follow multiple traders across different categories to spread risk and capture opportunities."
    },
    {
      icon: Zap,
      title: "Auto-Execute Trades (Premium)",
      description: "Premium users can enable automatic trade execution - copy trades instantly without lifting a finger."
    }
  ];

  const steps = [
    {
      number: "1",
      title: "Find Top Traders",
      description: "Browse our leaderboard of top-performing Polymarket traders. Filter by category, ROI, or win rate.",
      cta: "Explore Traders",
      link: "/discover"
    },
    {
      number: "2",
      title: "Follow & Copy",
      description: "Click 'Follow' on any trader to start receiving their trade signals. Enable auto-copy with Premium.",
      cta: "See How It Works",
      link: "#how-it-works"
    },
    {
      number: "3",
      title: "Track Performance",
      description: "Monitor your copied trades, track your profits, and adjust your strategy in real-time.",
      cta: "View Dashboard",
      link: "/portfolio"
    }
  ];

  return (
    <>
      <Navigation />
      
      <main className="min-h-screen bg-slate-50">
        {/* Hero Section */}
        <section className="relative bg-gradient-to-b from-white to-slate-50 pt-20 pb-16 md:pt-32 md:pb-24">
          <div className="absolute inset-0 bg-gradient-to-br from-polycopy-yellow/5 via-transparent to-transparent" />
          
          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-4xl mx-auto">
              {/* Badge */}
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-polycopy-yellow/10 border border-polycopy-yellow/20 mb-6">
                <TrendingUp className="w-4 h-4 text-polycopy-yellow" />
                <span className="text-sm font-medium text-slate-900">
                  Trusted by 1,000+ traders
                </span>
              </div>

              {/* Headline */}
              <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-slate-900 leading-tight mb-6">
                Copy Trading Made{' '}
                <span className="relative inline-block">
                  <span className="relative z-10 text-polycopy-yellow">Simple</span>
                  <svg className="absolute -bottom-2 left-0 w-full h-3 text-polycopy-yellow/30" viewBox="0 0 200 12" preserveAspectRatio="none">
                    <path d="M0,8 Q50,0 100,8 T200,8" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
                  </svg>
                </span>
              </h1>

              <p className="text-xl text-slate-600 mb-8 leading-relaxed">
                Follow top Polymarket traders and copy their winning strategies.<br className="hidden sm:inline" />
                No research needed. Start free in 60 seconds.
              </p>

              {/* CTAs */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
                <Link href="/login?mode=signup">
                  <Button size="lg" className="bg-polycopy-yellow text-slate-900 hover:bg-polycopy-yellow-hover font-semibold text-base px-8 h-12 shadow-lg shadow-polycopy-yellow/20">
                    Start Copy Trading Free
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </Link>
                <Link href="/discover">
                  <Button size="lg" variant="outline" className="font-semibold text-base px-8 h-12">
                    Browse Top Traders
                  </Button>
                </Link>
              </div>

              {/* Trust indicators */}
              <div className="flex items-center justify-center gap-8 text-sm text-slate-600">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  <span>No credit card required</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  <span>Start free forever</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* What is Copy Trading Section */}
        <section className="py-16 md:py-24 bg-white">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
                What is Copy Trading?
              </h2>
              <div className="w-24 h-1 bg-polycopy-yellow mx-auto mb-6" />
            </div>

            <div className="prose prose-lg max-w-3xl mx-auto text-slate-700">
              <p className="text-lg leading-relaxed mb-6">
                Copy trading lets you <strong>automatically replicate the trades of experienced traders</strong> without doing your own research. It's like having a team of expert traders working for you 24/7.
              </p>
              <p className="text-lg leading-relaxed mb-6">
                On Polycopy, you can browse top-performing Polymarket traders, see their track records, and follow them with one click. When they make a trade, you'll get notified instantly. With our Premium plan, trades are automatically executed in your account - completely hands-free.
              </p>
              <p className="text-lg leading-relaxed">
                Whether you're new to prediction markets or an experienced trader looking to diversify, copy trading helps you <strong>leverage proven strategies</strong> and save hours of research time.
              </p>
            </div>
          </div>
        </section>

        {/* How It Works Section */}
        <section id="how-it-works" className="py-16 md:py-24 bg-slate-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
                How Copy Trading Works
              </h2>
              <p className="text-xl text-slate-600 max-w-2xl mx-auto">
                Get started in three simple steps
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8 mb-12">
              {steps.map((step, index) => (
                <Card key={index} className="p-8 text-center hover:shadow-lg transition-shadow">
                  <div className="w-16 h-16 bg-polycopy-yellow/10 rounded-full flex items-center justify-center mx-auto mb-6">
                    <span className="text-2xl font-bold text-polycopy-yellow">{step.number}</span>
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-3">{step.title}</h3>
                  <p className="text-slate-600 mb-6 leading-relaxed">{step.description}</p>
                  <Link href={step.link}>
                    <Button variant="outline" className="w-full">
                      {step.cta}
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </Link>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Benefits Section */}
        <section className="py-16 md:py-24 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
                Why Copy Trading?
              </h2>
              <p className="text-xl text-slate-600 max-w-2xl mx-auto">
                The benefits of following proven traders
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-8">
              {benefits.map((benefit, index) => {
                const Icon = benefit.icon;
                return (
                  <Card key={index} className="p-8 hover:border-polycopy-yellow/30 transition-colors">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 bg-polycopy-yellow/10 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Icon className="w-6 h-6 text-polycopy-yellow" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-slate-900 mb-2">{benefit.title}</h3>
                        <p className="text-slate-600 leading-relaxed">{benefit.description}</p>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        {/* Live Trader Examples */}
        <section className="py-16 md:py-24 bg-slate-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
                Real Traders, Real Results
              </h2>
              <p className="text-xl text-slate-600">
                See who you could be following
              </p>
            </div>

            {loading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-polycopy-yellow mx-auto" />
              </div>
            ) : (
              <div className="grid md:grid-cols-3 gap-6 mb-8">
                {topTraders.map((trader) => {
                  const roi = trader.volume > 0 ? ((trader.pnl / trader.volume) * 100) : 0;
                  const displayName = trader.display_name && trader.display_name.trim() && 
                                     !/^0x[a-fA-F0-9]{40}$/.test(trader.display_name.trim())
                    ? trader.display_name.trim()
                    : `${trader.wallet_address.slice(0, 6)}...${trader.wallet_address.slice(-4)}`;
                  const initials = getTraderAvatarInitials({ displayName: trader.display_name || '', wallet: trader.wallet_address });

                  return (
                    <Card key={trader.wallet_address} className="p-6 hover:shadow-lg transition-shadow">
                      <div className="flex items-center gap-3 mb-4">
                        <Avatar className="w-14 h-14">
                          {trader.profile_image && <AvatarImage src={trader.profile_image} alt={displayName} />}
                          <AvatarFallback className="bg-gradient-to-br from-orange-400 to-orange-600 text-white font-bold text-lg">
                            {initials}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-slate-900 truncate">{displayName}</h3>
                          <p className="text-sm text-slate-500">{trader.follower_count} followers</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                          <p className="text-xs text-slate-500 mb-1">ROI</p>
                          <p className={`text-lg font-bold ${roi >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {roi > 0 ? '+' : ''}{roi.toFixed(1)}%
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 mb-1">Win Rate</p>
                          <p className="text-lg font-bold text-slate-900">
                            {trader.win_rate ? `${(trader.win_rate * 100).toFixed(0)}%` : 'N/A'}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 mb-1">P&L</p>
                          <p className={`text-lg font-bold ${trader.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {trader.pnl >= 0 ? '+' : ''}${Math.abs(trader.pnl).toLocaleString()}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 mb-1">Trades</p>
                          <p className="text-lg font-bold text-slate-900">{trader.total_trades}</p>
                        </div>
                      </div>

                      <Link href={`/trader/${trader.wallet_address}`}>
                        <Button className="w-full bg-polycopy-yellow text-slate-900 hover:bg-polycopy-yellow-hover font-semibold">
                          View Profile
                        </Button>
                      </Link>
                    </Card>
                  );
                })}
              </div>
            )}

            <div className="text-center">
              <Link href="/discover">
                <Button size="lg" variant="outline" className="font-semibold">
                  See All Traders
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* Copy Trading vs Manual Trading */}
        <section className="py-16 md:py-24 bg-white">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
                Copy Trading vs Manual Trading
              </h2>
              <p className="text-xl text-slate-600">
                See the difference
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b-2 border-slate-200">
                    <th className="text-left py-4 px-4 text-slate-900 font-bold">Feature</th>
                    <th className="text-center py-4 px-4 text-slate-900 font-bold">Copy Trading</th>
                    <th className="text-center py-4 px-4 text-slate-900 font-bold">Manual Trading</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  <tr>
                    <td className="py-4 px-4 text-slate-700">Time Required</td>
                    <td className="py-4 px-4 text-center">
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                        5 min/week
                      </Badge>
                    </td>
                    <td className="py-4 px-4 text-center">
                      <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                        Hours/day
                      </Badge>
                    </td>
                  </tr>
                  <tr>
                    <td className="py-4 px-4 text-slate-700">Research Needed</td>
                    <td className="py-4 px-4 text-center text-green-600">✓ Done for you</td>
                    <td className="py-4 px-4 text-center text-red-600">✗ Required</td>
                  </tr>
                  <tr>
                    <td className="py-4 px-4 text-slate-700">Experience Level</td>
                    <td className="py-4 px-4 text-center text-green-600">✓ Beginner friendly</td>
                    <td className="py-4 px-4 text-center text-red-600">✗ Expert level</td>
                  </tr>
                  <tr>
                    <td className="py-4 px-4 text-slate-700">24/7 Monitoring</td>
                    <td className="py-4 px-4 text-center text-green-600">✓ Automatic</td>
                    <td className="py-4 px-4 text-center text-red-600">✗ Manual only</td>
                  </tr>
                  <tr>
                    <td className="py-4 px-4 text-slate-700">Diversification</td>
                    <td className="py-4 px-4 text-center text-green-600">✓ Follow multiple traders</td>
                    <td className="py-4 px-4 text-center text-slate-600">Limited by time</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section className="py-16 md:py-24 bg-slate-50">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
                Frequently Asked Questions
              </h2>
              <p className="text-xl text-slate-600">
                Everything you need to know about copy trading
              </p>
            </div>

            <div className="space-y-4">
              {faqs.map((faq, index) => (
                <Card 
                  key={index} 
                  className="overflow-hidden cursor-pointer hover:border-polycopy-yellow/30 transition-colors"
                  onClick={() => setOpenFaqIndex(openFaqIndex === index ? null : index)}
                >
                  <div className="p-6">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-bold text-slate-900 pr-4">{faq.question}</h3>
                      <ChevronDown 
                        className={`w-5 h-5 text-slate-500 flex-shrink-0 transition-transform ${
                          openFaqIndex === index ? 'rotate-180' : ''
                        }`} 
                      />
                    </div>
                    {openFaqIndex === index && (
                      <p className="mt-4 text-slate-600 leading-relaxed">
                        {faq.answer}
                      </p>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA Section */}
        <section className="py-16 md:py-24 bg-gradient-to-br from-slate-900 to-slate-800 text-white">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-3xl md:text-5xl font-bold mb-6">
              Start Copy Trading Today
            </h2>
            <p className="text-xl text-slate-300 mb-8">
              Join 1,000+ traders who are already copying the best Polymarket strategies
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/login?mode=signup">
                <Button size="lg" className="bg-polycopy-yellow text-slate-900 hover:bg-polycopy-yellow-hover font-semibold text-base px-8 h-12 shadow-lg">
                  Get Started Free
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>
              <Link href="/discover">
                <Button size="lg" variant="outline" className="font-semibold text-base px-8 h-12 bg-transparent border-white text-white hover:bg-white/10">
                  Browse Traders
                </Button>
              </Link>
            </div>
            <p className="mt-6 text-sm text-slate-400">
              No credit card required • Free plan available forever
            </p>
          </div>
        </section>
      </main>
    </>
  );
}
