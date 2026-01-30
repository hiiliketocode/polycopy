"use client";

import { useState, useEffect, useRef } from "react";
import { TraderCard, type Trader } from "./trader-card";
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react";

// Mock data for demonstration - in production, this would come from the API
const MOCK_TRADERS: Trader[] = [
  {
    wallet: "0x0b9c7e44f4712f9c4f0c1d3d8d5e6f7a8b9c0d1e",
    displayName: "MCgenius",
    pnl: 2000000,
    roi: 14,
    volume: 14200000,
    rank: 1,
    profileImage: null,
  },
  {
    wallet: "0x006c16ea006c16ea006c16ea006c16ea006c16ea",
    displayName: "0x006c...16ea",
    pnl: 4100000,
    roi: 11,
    volume: 37800000,
    rank: 2,
    profileImage: null,
  },
  {
    wallet: "0xe20ae469e20ae469e20ae469e20ae469e20ae469",
    displayName: "gopatriots",
    pnl: 3100000,
    roi: 9,
    volume: 36100000,
    rank: 3,
    profileImage: null,
  },
  {
    wallet: "0xdc877ab6dc877ab6dc877ab6dc877ab6dc877ab6",
    displayName: "432614799197",
    pnl: 5600000,
    roi: 6,
    volume: 87900000,
    rank: 4,
    profileImage: null,
  },
  {
    wallet: "0x6a7233ee6a7233ee6a7233ee6a7233ee6a7233ee",
    displayName: "kch123",
    pnl: 6000000,
    roi: 6,
    volume: 106500000,
    rank: 5,
    profileImage: null,
  },
  {
    wallet: "0xd0b4fed6d0b4fed6d0b4fed6d0b4fed6d0b4fed6",
    displayName: "MrSparklySimpsons",
    pnl: 2000000,
    roi: 4,
    volume: 44000000,
    rank: 6,
    profileImage: null,
  },
  {
    wallet: "0x200575ea200575ea200575ea200575ea200575ea",
    displayName: "RN1",
    pnl: 1900000,
    roi: 3,
    volume: 68100000,
    rank: 7,
    profileImage: null,
  },
  {
    wallet: "0xe90b5da2e90b5da2e90b5da2e90b5da2e90b5da2",
    displayName: "gmanas",
    pnl: 2300000,
    roi: 1,
    volume: 195600000,
    rank: 8,
    profileImage: null,
  },
  {
    wallet: "0x1234abcd1234abcd1234abcd1234abcd1234abcd",
    displayName: "cryptowhale",
    pnl: 1500000,
    roi: 8,
    volume: 25000000,
    rank: 9,
    profileImage: null,
  },
  {
    wallet: "0x5678efgh5678efgh5678efgh5678efgh5678efgh",
    displayName: "tradingpro",
    pnl: 1200000,
    roi: 7,
    volume: 18000000,
    rank: 10,
    profileImage: null,
  },
  {
    wallet: "0x9abcijkl9abcijkl9abcijkl9abcijkl9abcijkl",
    displayName: "polymaster",
    pnl: 980000,
    roi: 5,
    volume: 22000000,
    rank: 11,
    profileImage: null,
  },
  {
    wallet: "0xdefgmnop0defgmnop0defgmnop0defgmnop0defg",
    displayName: "smartmoney99",
    pnl: 850000,
    roi: 12,
    volume: 9500000,
    rank: 12,
    profileImage: null,
  },
];

interface StepFollowTradersProps {
  selectedTraders: string[];
  onSelectTrader: (wallet: string) => void;
  onTradersLoaded?: (traders: Trader[]) => void;
}

export function StepFollowTraders({
  selectedTraders,
  onSelectTrader,
  onTradersLoaded,
}: StepFollowTradersProps) {
  const [traders, setTraders] = useState<Trader[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showLeftButton, setShowLeftButton] = useState(false);
  const [showRightButton, setShowRightButton] = useState(true);

  useEffect(() => {
    const fetchTraders = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(
          '/api/polymarket/leaderboard?limit=50&orderBy=PNL&category=OVERALL&timePeriod=month'
        );
        
        if (!response.ok) {
          throw new Error('Failed to fetch traders');
        }
        
        const data = await response.json();
        
        // Calculate ROI if not provided
        const tradersWithROI = (data.traders || []).map((trader: Trader) => ({
          ...trader,
          roi: trader.roi || (trader.volume > 0 ? ((trader.pnl / trader.volume) * 100) : 0)
        }));
        
        setTraders(tradersWithROI);
        
        // Notify parent component
        if (onTradersLoaded) {
          onTradersLoaded(tradersWithROI);
        }
      } catch (err) {
        setError("Failed to load traders. Please refresh the page.");
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTraders();
  }, [onTradersLoaded]);

  // Check scroll position to show/hide buttons
  const handleScroll = () => {
    if (scrollContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
      setShowLeftButton(scrollLeft > 10);
      setShowRightButton(scrollLeft < scrollWidth - clientWidth - 10);
    }
  };

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
      // Check initial state
      handleScroll();
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, [traders]);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const scrollAmount = 400; // Adjust based on card width
      const newScrollLeft = direction === 'left'
        ? scrollContainerRef.current.scrollLeft - scrollAmount
        : scrollContainerRef.current.scrollLeft + scrollAmount;
      
      scrollContainerRef.current.scrollTo({
        left: newScrollLeft,
        behavior: 'smooth'
      });
    }
  };

  const minRequired = 5;
  const visibleTraders = traders.slice(0, 50);

  return (
    <div className="flex flex-col pt-[2.5vh] md:pt-0">
      {/* Welcome Header */}
      <div className="text-center mb-4">
        <p className="text-muted-foreground text-sm mb-1">Welcome! Let{"'"}s get you set up.</p>
        <h1 className="text-xl md:text-2xl font-semibold text-foreground mb-1 text-balance">
          Follow {minRequired}+ top traders to get started
        </h1>
        <p className="text-muted-foreground text-sm">
          {selectedTraders.length} of {minRequired} selected
        </p>
      </div>

      {/* Traders Grid with Scroll */}
      <div>
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="text-center py-20">
            <p className="text-destructive mb-4">{error}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="text-primary hover:underline"
            >
              Try again
            </button>
          </div>
        ) : (
          <div className="relative group">
            {/* Left Scroll Button */}
            {showLeftButton && (
              <button
                onClick={() => scroll('left')}
                className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 md:w-12 md:h-12 rounded-full bg-background border-2 border-border shadow-lg flex items-center justify-center hover:bg-secondary hover:border-primary transition-all opacity-90 hover:opacity-100"
                aria-label="Scroll left"
              >
                <ChevronLeft className="w-5 h-5 md:w-6 md:h-6 text-foreground" />
              </button>
            )}

            {/* Right Scroll Button */}
            {showRightButton && (
              <button
                onClick={() => scroll('right')}
                className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 md:w-12 md:h-12 rounded-full bg-background border-2 border-border shadow-lg flex items-center justify-center hover:bg-secondary hover:border-primary transition-all opacity-90 hover:opacity-100"
                aria-label="Scroll right"
              >
                <ChevronRight className="w-5 h-5 md:w-6 md:h-6 text-foreground" />
              </button>
            )}

            {/* Scrollable Grid Container */}
            <div 
              ref={scrollContainerRef}
              className="overflow-x-auto pb-4 pt-2 -mx-4 px-4 scrollbar-hide"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              <div className="grid grid-rows-2 grid-flow-col gap-3 md:gap-4 auto-cols-[200px]">{visibleTraders.map((trader) => (
                  <div key={trader.wallet}>
                    <TraderCard
                      trader={trader}
                      isFollowing={selectedTraders.includes(trader.wallet)}
                      onToggleFollow={onSelectTrader}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export { MOCK_TRADERS };
