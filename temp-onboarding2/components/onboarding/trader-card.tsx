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

  return (
    <div className="relative bg-card rounded-xl border border-border p-3 md:p-4 shadow-sm hover:shadow-md transition-shadow overflow-visible">
      {/* Rank Badge */}
      <div className="absolute -top-2 right-2 w-6 h-6 md:w-7 md:h-7 bg-polycopy-black text-white rounded-full flex items-center justify-center text-xs font-semibold z-10">
        #{trader.rank}
      </div>

      {/* Avatar and Name */}
      <div className="flex items-center gap-2 md:gap-3 mb-3">
        {trader.profileImage ? (
          <img
            src={trader.profileImage || "/placeholder.svg"}
            alt={trader.displayName}
            className="w-9 h-9 md:w-10 md:h-10 rounded-full object-cover"
          />
        ) : (
          <div className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold text-xs md:text-sm">
            {getInitials(trader.displayName)}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-card-foreground text-sm truncate">
            {trader.displayName}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {truncateWallet(trader.wallet)}
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-1 mb-3 text-center">
        <div>
          <p className="text-[10px] md:text-xs text-muted-foreground uppercase tracking-wide">
            ROI
          </p>
          <p
            className={cn(
              "font-semibold text-xs md:text-sm",
              trader.roi >= 0 ? "text-polycopy-success" : "text-polycopy-error"
            )}
          >
            {formatPercentage(trader.roi)}
          </p>
        </div>
        <div>
          <p className="text-[10px] md:text-xs text-muted-foreground uppercase tracking-wide">
            P&L
          </p>
          <p
            className={cn(
              "font-semibold text-xs md:text-sm",
              trader.pnl >= 0 ? "text-polycopy-success" : "text-polycopy-error"
            )}
          >
            {formatCurrency(trader.pnl)}
          </p>
        </div>
        <div>
          <p className="text-[10px] md:text-xs text-muted-foreground uppercase tracking-wide">
            Vol
          </p>
          <p className="font-semibold text-xs md:text-sm text-card-foreground">
            {formatCurrency(trader.volume)}
          </p>
        </div>
      </div>

      {/* Follow Button */}
      <button
        type="button"
        onClick={() => onToggleFollow(trader.wallet)}
        className={cn(
          "w-full py-2 rounded-lg font-semibold text-xs md:text-sm transition-all",
          isFollowing
            ? "bg-card border-2 border-primary text-primary hover:bg-accent"
            : "bg-primary text-primary-foreground hover:bg-primary/90"
        )}
      >
        {isFollowing ? (
          <span className="flex items-center justify-center gap-1.5">
            <Check className="w-3.5 h-3.5" />
            Following
          </span>
        ) : (
          "Follow"
        )}
      </button>
    </div>
  );
}
