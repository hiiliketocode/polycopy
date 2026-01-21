'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export function CurationCarousel() {
  const [currentSlide, setCurrentSlide] = useState(0);

  const slides = [
    {
      title: 'Filter by Category',
      description: 'Find traders who specialize in the markets you care about - Politics, Sports, Crypto, and more.',
      image: (
        <div className="bg-slate-800 rounded-xl p-6">
          <div className="flex gap-2 mb-4">
            {['All', 'Politics', 'Sports', 'Crypto'].map((cat, i) => (
              <button
                key={cat}
                className={`px-4 py-2 rounded-lg text-sm font-semibold ${
                  i === 1 ? 'bg-[#FDB022] text-slate-900' : 'bg-slate-700 text-white'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
          <div className="space-y-3">
            {['Trump wins 2024?', 'Biden approval >45%?', 'Midterm turnout record?'].map((trade, i) => (
              <div key={i} className="bg-slate-700/50 rounded-lg p-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-600"></div>
                <div className="flex-1">
                  <div className="text-white text-sm font-semibold">PoliPredictor</div>
                  <div className="text-slate-400 text-xs">{trade}</div>
                </div>
                <div className="text-green-400 text-sm font-bold">Buy Yes</div>
              </div>
            ))}
          </div>
        </div>
      )
    },
    {
      title: 'Performance History',
      description: 'See detailed performance metrics, win rates, and ROI for every trader before you follow.',
      image: (
        <div className="bg-white rounded-xl p-6 border-2 border-slate-200">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-amber-500 to-yellow-600"></div>
            <div>
              <div className="font-bold text-slate-900 text-lg">CryptoWhale</div>
              <div className="text-sm text-slate-500">@cryptowhale</div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="bg-slate-50 rounded-lg p-3">
              <div className="text-xs text-slate-500 mb-1">ROI</div>
              <div className="text-lg font-bold text-green-600">+142%</div>
            </div>
            <div className="bg-slate-50 rounded-lg p-3">
              <div className="text-xs text-slate-500 mb-1">Win Rate</div>
              <div className="text-lg font-bold text-slate-900">68%</div>
            </div>
            <div className="bg-slate-50 rounded-lg p-3">
              <div className="text-xs text-slate-500 mb-1">Trades</div>
              <div className="text-lg font-bold text-slate-900">247</div>
            </div>
          </div>
          <div className="h-32 bg-gradient-to-t from-green-100 to-green-50 rounded-lg flex items-end justify-around p-2">
            {[40, 60, 45, 75, 65, 80, 90].map((height, i) => (
              <div key={i} className="bg-green-500 rounded-t" style={{ width: '12%', height: `${height}%` }}></div>
            ))}
          </div>
        </div>
      )
    },
    {
      title: 'Your Curated Feed',
      description: 'Get real-time updates from traders you follow. See exactly what they\'re trading and when. Filter by category, outcome, or trader to find the perfect trade.',
      image: (
        <div className="bg-white rounded-xl p-6 border-2 border-slate-200">
          <div className="flex items-center gap-3 mb-4 pb-3 border-b border-slate-200">
            <span className="font-bold text-slate-900 text-sm">Your Feed</span>
            <div className="ml-auto flex gap-2">
              <span className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded-full font-semibold">Crypto</span>
            </div>
          </div>
          
          <div className="space-y-4">
            {/* Trade 1 */}
            <div className="bg-slate-50 rounded-lg p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700"></div>
                <div className="flex-1">
                  <div className="font-semibold text-slate-900 text-sm">Bitcoin hits $100k</div>
                  <div className="text-xs text-slate-500">by TopDog • 2h ago</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div>
                  <div className="text-xs text-slate-500 mb-1">ACTION</div>
                  <div className="text-sm font-bold text-green-600">Buy Yes</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-1">PRICE</div>
                  <div className="text-sm font-bold text-slate-900">$0.72</div>
                </div>
              </div>
              <button className="w-full bg-[#FDB022] text-slate-900 py-2 rounded-lg font-bold text-sm">
                Copy Trade
              </button>
            </div>
            
            {/* Trade 2 - More compact */}
            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-600"></div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-slate-900 text-xs truncate">Fed cuts by March?</div>
                <div className="text-xs text-slate-500">by PoliPredictor</div>
              </div>
              <div className="text-xs font-bold text-green-600">Buy No</div>
            </div>
            
            {/* Trade 3 - More compact */}
            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-yellow-600"></div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-slate-900 text-xs truncate">ETH $5k by May?</div>
                <div className="text-xs text-slate-500">by CryptoWhale</div>
              </div>
              <div className="text-xs font-bold text-green-600">Buy Yes</div>
            </div>
          </div>
        </div>
      )
    }
  ];

  const nextSlide = () => {
    setCurrentSlide((prev) => (prev + 1) % slides.length);
  };

  const prevSlide = () => {
    setCurrentSlide((prev) => (prev - 1 + slides.length) % slides.length);
  };

  return (
    <div className="bg-white py-20 lg:py-32">
      <div className="max-w-7xl mx-auto px-6">
        <h2 className="text-4xl lg:text-5xl font-black text-slate-900 mb-16 text-center">
          Most platforms overwhelm. We curate.
        </h2>
        
        <div className="relative max-w-5xl mx-auto">
          {/* Carousel */}
          <div className="overflow-hidden">
            <div 
              className="flex transition-transform duration-500 ease-in-out"
              style={{ transform: `translateX(-${currentSlide * 100}%)` }}
            >
              {slides.map((slide, index) => (
                <div key={index} className="w-full flex-shrink-0 px-4">
                  <div className="grid lg:grid-cols-2 gap-8 items-center">
                    <div>
                      <h3 className="text-3xl font-bold text-slate-900 mb-4">{slide.title}</h3>
                      <p className="text-lg text-slate-600">{slide.description}</p>
                    </div>
                    <div>
                      {slide.image}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-center gap-4 mt-8">
            <button
              onClick={prevSlide}
              className="p-2 rounded-full bg-slate-100 hover:bg-slate-200 transition-colors"
              aria-label="Previous slide"
            >
              <ChevronLeft className="w-6 h-6 text-slate-700" />
            </button>
            
            <div className="flex gap-2">
              {slides.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentSlide(index)}
                  className={`w-2 h-2 rounded-full transition-all ${
                    index === currentSlide ? 'bg-[#FDB022] w-8' : 'bg-slate-300'
                  }`}
                  aria-label={`Go to slide ${index + 1}`}
                />
              ))}
            </div>
            
            <button
              onClick={nextSlide}
              className="p-2 rounded-full bg-slate-100 hover:bg-slate-200 transition-colors"
              aria-label="Next slide"
            >
              <ChevronRight className="w-6 h-6 text-slate-700" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
