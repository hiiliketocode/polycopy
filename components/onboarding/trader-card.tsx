"use client";

import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

export interface Trader {
  wallet: string;
  displayName: string;
  pnl: number;
  roi: number;
  volume: number;
  rank: number;
  profileImage?: string | null;
}

interface TraderCardProps {
  trader: Trader;
  isFollowing: boolean;
  onToggleFollow: (wallet: string) => void;
}

export function TraderCard({
  trader,
  isFollowing,
  onToggleFollow,
}: TraderCardProps) {
  const formatCurrency = (value: number) => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(1)}M`;
    }
    if (value >= 1000) {
      return `$${(value / 1000).toFixed(1)}K`;
    }
    return `$${value.toFixed(0)}`;
  };

  const formatPercentage = (value: number) => {
    const sign = value >= 0 ? "+" : "";
    return `${sign}${value.toFixed(0)}%`;
  };

  const getInitials = (name: string) => {
    if (name.startsWith("@")) {
      return name.slice(1, 3).toUpperCase();
    }
    if (name.startsWith("0x")) {
      return name.slice(2, 4).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  const truncateWallet = (wallet: string) => {
    return `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
  };

  const getAvatarColor = (name: string) => {
    // Generate consistent color based on name/wallet
    const colors = [
      'from-orange-400 to-orange-600',
      'from-yellow-400 to-yellow-600',
      'from-blue-400 to-blue-600',
      'from-purple-400 to-purple-600',
      'from-green-400 to-green-600',
      'from-red-400 to-red-600',
      'from-pink-400 to-pink-600',
      'from-indigo-400 to-indigo-600',
    ];
    const index = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length;
    return colors[index];
  };

  return (
    <div className="relative bg-card rounded-lg border border-border p-3 shadow-sm hover:shadow-md hover:border-primary/30 transition-all overflow-visible h-full flex flex-col">
      {/* Avatar and Name */}
      <div className="flex items-center gap-2 mb-2">
        {trader.profileImage ? (
          <img
            src={trader.profileImage || "/placeholder.svg"}
            alt={trader.displayName}
            className="w-10 h-10 rounded-full object-cover flex-shrink-0"
          />
        ) : (
          <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${getAvatarColor(trader.displayName)} flex items-center justify-center text-white font-bold text-sm flex-shrink-0`}>
            {getInitials(trader.displayName)}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-foreground text-sm truncate">
            {trader.displayName}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {truncateWallet(trader.wallet)}
          </p>
        </div>
      </div>

      {/* Stats - Compact Grid */}
      <div className="grid grid-cols-3 gap-1.5 mb-2">
        <div className="bg-secondary/50 rounded-md p-1.5 text-center">
          <p className="text-[10px] text-muted-foreground">ROI</p>
          <p
            className={cn(
              "font-bold text-xs",
              trader.roi >= 0 ? "text-profit-green" : "text-loss-red"
            )}
          >
            {formatPercentage(trader.roi)}
          </p>
        </div>
        <div className="bg-secondary/50 rounded-md p-1.5 text-center">
          <p className="text-[10px] text-muted-foreground">P&L</p>
          <p
            className={cn(
              "font-bold text-xs",
              trader.pnl >= 0 ? "text-profit-green" : "text-loss-red"
            )}
          >
            {formatCurrency(trader.pnl)}
          </p>
        </div>
        <div className="bg-secondary/50 rounded-md p-1.5 text-center">
          <p className="text-[10px] text-muted-foreground">VOL</p>
          <p className="font-bold text-xs text-foreground">
            {formatCurrency(trader.volume)}
          </p>
        </div>
      </div>

      {/* Follow Button */}
      <button
        type="button"
        onClick={() => onToggleFollow(trader.wallet)}
        className={cn(
          "w-full py-2 rounded-lg font-semibold text-sm transition-all mt-auto",
          isFollowing
            ? "bg-primary/10 border-2 border-primary text-primary hover:bg-primary/20"
            : "bg-polycopy-yellow text-neutral-black hover:bg-polycopy-yellow-hover"
        )}
      >
        {isFollowing ? (
          <span className="flex items-center justify-center gap-1.5">
            <Check className="w-4 h-4" />
            Following
          </span>
        ) : (
          "Follow"
        )}
      </button>
    </div>
  );
}
