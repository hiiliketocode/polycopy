'use client';

import Link from 'next/link';
import { ArrowRight, Trophy, Vote, Bitcoin, Sparkles, Building2, TrendingUp, Laptop, Cloud, AlertCircle } from 'lucide-react';

export default function PolymarketMarketCategoriesPage() {
  const categories = [
    {
      slug: 'sports-prediction-markets',
      title: 'Sports',
      icon: Trophy,
      description: 'NFL, NBA, Soccer, MLB, NHL, and more. Trade on game outcomes, championships, MVP awards, and player stats.',
      examples: ['Super Bowl winner', 'NBA MVP', 'World Cup champion', 'Team win totals'],
    },
    {
      slug: 'politics-prediction-markets',
      title: 'Politics',
      icon: Vote,
      description: 'Presidential elections, Senate races, policy outcomes, and global political events.',
      examples: ['2028 Presidential election', 'Senate control', 'Supreme Court decisions', 'Ballot measures'],
    },
    {
      slug: 'crypto-prediction-markets',
      title: 'Crypto',
      icon: Bitcoin,
      description: 'Bitcoin, Ethereum, altcoins, DeFi, NFTs, regulation, and blockchain technology.',
      examples: ['BTC to $100K?', 'ETH ETF approval', 'Token launches', 'Protocol upgrades'],
    },
    {
      slug: 'pop-culture-prediction-markets',
      title: 'Pop Culture',
      icon: Sparkles,
      description: 'Entertainment, celebrities, awards shows, movies, TV, music, and viral trends.',
      examples: ['Oscars winners', 'Grammy predictions', 'Box office performance', 'Celebrity news'],
    },
    {
      slug: 'business-prediction-markets',
      title: 'Business',
      icon: Building2,
      description: 'Corporate earnings, IPOs, M&A, leadership changes, and company performance.',
      examples: ['Tech earnings', 'IPO success', 'CEO departures', 'Mergers & acquisitions'],
    },
    {
      slug: 'economics-prediction-markets',
      title: 'Economics',
      icon: TrendingUp,
      description: 'Fed policy, inflation, GDP growth, employment, interest rates, and macro trends.',
      examples: ['Fed rate decisions', 'Inflation targets', 'Recession odds', 'Jobs reports'],
    },
    {
      slug: 'tech-prediction-markets',
      title: 'Tech',
      icon: Laptop,
      description: 'AI developments, product launches, tech company milestones, and industry trends.',
      examples: ['iPhone sales', 'AI breakthroughs', 'Product launches', 'Tech layoffs'],
    },
    {
      slug: 'weather-prediction-markets',
      title: 'Weather',
      icon: Cloud,
      description: 'Temperature forecasts, hurricanes, snowfall, seasonal predictions, and climate events.',
      examples: ['Hurricane season', 'Snowfall totals', 'Record temperatures', 'El Niño/La Niña'],
    },
  ];

  return (
    <div className="min-h-screen bg-poly-cream">
      {/* Hero Section */}
      <section className="bg-poly-paper border-b border-border">
        <div className="max-w-4xl mx-auto px-4 py-16 md:py-24">
          <div className="text-center">
            <h1 className="font-sans font-black uppercase tracking-tight text-4xl md:text-5xl text-poly-black mb-6">
              Polymarket Market Categories
            </h1>
            <p className="font-body text-xl text-muted-foreground mb-8 leading-relaxed max-w-3xl mx-auto">
              Polymarket has prediction markets for everything. Explore all categories, see what traders are profitable in each, and find your edge.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="https://polycopy.app"
                className="inline-flex items-center justify-center bg-poly-yellow px-8 py-3.5 font-sans text-xs font-bold uppercase tracking-widest text-poly-black transition-all hover:bg-poly-black hover:text-poly-yellow"
              >
                Start Following Traders
                <ArrowRight className="w-5 h-5 ml-2" />
              </Link>
              <Link
                href="/v2/discover"
                className="inline-flex items-center justify-center border border-border bg-card px-8 py-3.5 font-sans text-xs font-bold uppercase tracking-widest text-poly-black transition-all hover:bg-poly-black hover:text-poly-yellow"
              >
                Browse All Markets
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Categories Grid */}
      <section className="py-16 md:py-20 bg-poly-cream border-b border-border">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="font-sans font-black uppercase tracking-tight text-3xl md:text-4xl text-poly-black mb-12 text-center">
            Explore All Categories
          </h2>
          <div className="grid md:grid-cols-2 gap-8">
            {categories.map((category) => {
              const Icon = category.icon;
              return (
                <Link
                  key={category.slug}
                  href={`/v2/${category.slug}`}
                  className="group border border-border bg-card p-6 transition-all hover:border-poly-yellow"
                >
                  <div className="flex items-start gap-4 mb-4">
                    <div className="flex h-10 w-10 items-center justify-center border border-border flex-shrink-0 text-poly-yellow">
                      <Icon className="w-6 h-6" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-sans font-black uppercase tracking-tight text-2xl text-poly-black mb-2 group-hover:text-poly-yellow transition-colors">
                        {category.title}
                      </h3>
                      <p className="font-body text-sm text-muted-foreground leading-relaxed mb-4">
                        {category.description}
                      </p>
                    </div>
                  </div>

                  <div className="border border-border bg-poly-paper p-4 mb-4">
                    <p className="font-sans text-[10px] font-bold uppercase tracking-widest text-poly-yellow mb-2">
                      Example Markets
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {category.examples.map((example, i) => (
                        <span
                          key={i}
                          className="font-body text-sm text-muted-foreground bg-card px-3 py-1 border border-border"
                        >
                          {example}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-poly-yellow font-sans font-bold uppercase text-sm group-hover:gap-3 transition-all">
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
      <section className="py-16 md:py-20 bg-poly-paper border-b border-border">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="font-sans font-black uppercase tracking-tight text-3xl md:text-4xl text-poly-black mb-12 text-center">
            How to Choose Your Category
          </h2>
          <div className="space-y-6">
            <div className="border border-border bg-card p-6 border-l-4 border-l-profit-green">
              <h3 className="font-sans font-bold uppercase text-poly-black mb-3">Follow What You Know</h3>
              <p className="font-body text-sm text-muted-foreground leading-relaxed">
                The best traders specialize in markets they deeply understand. If you follow the NFL religiously, start with sports. If you're a crypto native, trade crypto markets. Knowledge = edge.
              </p>
            </div>

            <div className="border border-border bg-card p-6 border-l-4 border-l-info-blue">
              <h3 className="font-sans font-bold uppercase text-poly-black mb-3">Test Multiple Categories</h3>
              <p className="font-body text-sm text-muted-foreground leading-relaxed">
                You don't have to pick one. Browse traders in 2-3 categories you're interested in. Follow the best performers in each and see where you're most successful.
              </p>
            </div>

            <div className="border border-border bg-card p-6 border-l-4 border-l-poly-indigo">
              <h3 className="font-sans font-bold uppercase text-poly-black mb-3">Copy Specialists</h3>
              <p className="font-body text-sm text-muted-foreground leading-relaxed">
                On Polycopy, you can follow traders who specialize in specific categories. A sports trader, a politics trader, a crypto trader - copy the best from each category.
              </p>
            </div>

            <div className="border border-border bg-card p-6 border-l-4 border-l-poly-yellow">
              <h3 className="font-sans font-bold uppercase text-poly-black mb-3">Start Small, Diversify Later</h3>
              <p className="font-body text-sm text-muted-foreground leading-relaxed">
                Begin with one category you understand well. Once you're profitable, expand to other categories. Depth first, breadth second.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pro Tips */}
      <section className="py-16 md:py-20 bg-poly-cream border-b border-border">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="font-sans font-black uppercase tracking-tight text-3xl md:text-4xl text-poly-black mb-12 text-center">
            Category Trading Tips
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="border border-border bg-card p-6 border-l-4 border-l-profit-green">
              <h3 className="font-sans font-bold uppercase text-poly-black mb-2">Time-Sensitive Markets</h3>
              <p className="font-body text-sm text-muted-foreground">
                Sports, weather, and some politics markets resolve quickly. If you want fast feedback, these are great categories to start with.
              </p>
            </div>

            <div className="border border-border bg-card p-6 border-l-4 border-l-info-blue">
              <h3 className="font-sans font-bold uppercase text-poly-black mb-2">Long-Term Markets</h3>
              <p className="font-body text-sm text-muted-foreground">
                Presidential elections, tech product success, crypto price targets - these take months or years to resolve. Good for patient traders.
              </p>
            </div>

            <div className="border border-border bg-card p-6 border-l-4 border-l-poly-indigo">
              <h3 className="font-sans font-bold uppercase text-poly-black mb-2">High-Volume Categories</h3>
              <p className="font-body text-sm text-muted-foreground">
                Sports and politics see the most trading activity. More liquidity = easier to enter and exit positions at good prices.
              </p>
            </div>

            <div className="border border-border bg-card p-6 border-l-4 border-l-poly-yellow">
              <h3 className="font-sans font-bold uppercase text-poly-black mb-2">Niche Categories</h3>
              <p className="font-body text-sm text-muted-foreground">
                Weather, economics, and some tech markets have fewer traders. If you have specialized knowledge, you can find mispricings more easily.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 md:py-20 bg-poly-paper border-b border-border">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="font-sans font-black uppercase tracking-tight text-3xl md:text-4xl text-poly-black mb-6">
            Ready to Find Your Edge?
          </h2>
          <p className="font-body text-xl text-muted-foreground mb-4 leading-relaxed">
            Explore category pages, follow top traders in each, and start copying profitable strategies.
          </p>
          <p className="font-body text-lg text-muted-foreground mb-8 leading-relaxed">
            New to prediction markets? Start with our <Link href="/v2/prediction-markets-for-beginners" className="text-poly-yellow hover:underline font-medium">beginner's guide</Link>.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="https://polycopy.app"
              className="inline-flex items-center justify-center bg-poly-yellow px-8 py-3.5 font-sans text-xs font-bold uppercase tracking-widest text-poly-black transition-all hover:bg-poly-black hover:text-poly-yellow"
            >
              Get Started Free
              <ArrowRight className="w-5 h-5 ml-2" />
            </Link>
            <Link
              href="/v2/best-polymarket-traders"
              className="inline-flex items-center justify-center border border-border bg-card px-8 py-3.5 font-sans text-xs font-bold uppercase tracking-widest text-poly-black transition-all hover:bg-poly-black hover:text-poly-yellow"
            >
              View Top Traders
            </Link>
          </div>
          <p className="font-body text-sm text-muted-foreground mt-6">
            Free to browse all categories and traders. No credit card required.
          </p>
        </div>
      </section>

      {/* Disclaimer */}
      <section className="bg-poly-paper py-8 border-t border-border">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-0.5" />
            <p className="font-body text-sm text-muted-foreground leading-relaxed">
              <strong className="text-poly-black">Not Financial Advice:</strong> Prediction market trading involves risk. Past performance does not guarantee future results. Different categories have different risks and complexities. Only trade with funds you can afford to lose.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
