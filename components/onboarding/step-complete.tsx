"use client";

import { ArrowRight, Sparkles, Check } from "lucide-react";

interface StepCompleteProps {
  followedCount: number;
  onGoToFeed: () => void;
  isLoading?: boolean;
}

export function StepComplete({
  onGoToFeed,
  isLoading,
}: StepCompleteProps) {
  return (
    <div className="flex flex-col flex-1 items-center justify-center text-center">
      {/* Celebration Visual - Simple emoji checkmark */}
      <div className="relative mb-8">
        {/* Main success icon */}
        <div className="w-32 h-32 md:w-36 md:h-36 bg-gradient-to-br from-polycopy-success/20 to-polycopy-success/5 rounded-full flex items-center justify-center border-2 border-polycopy-success/30">
          <div className="w-24 h-24 md:w-28 md:h-28 bg-white rounded-full flex items-center justify-center shadow-lg">
            {/* Green check emoji */}
            <span className="text-6xl md:text-7xl">✅</span>
          </div>
        </div>
      </div>

      {/* Header */}
      <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-3 text-balance">
        {"You're all set!"}
      </h1>
      
      <p className="text-lg text-muted-foreground mb-10 max-w-md">
        Your personalized feed is ready! Tap below to go to your feed and start copying.
      </p>

      {/* CTA Button - Black text */}
      <button
        type="button"
        onClick={onGoToFeed}
        disabled={isLoading}
        className="px-10 py-4 bg-primary rounded-xl font-semibold text-lg hover:bg-primary/90 transition-all hover:scale-105 flex items-center gap-3 disabled:opacity-50 disabled:hover:scale-100 shadow-lg shadow-primary/25 text-black"
      >
        {isLoading ? (
          <>
            <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
            Setting up...
          </>
        ) : (
          <>
            Go to Your Feed
            <ArrowRight className="w-5 h-5 text-black" />
          </>
        )}
      </button>

      {/* Feature hints */}
      <div className="mt-10 flex flex-col md:flex-row items-center gap-4 md:gap-8 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <span>Real-time trade alerts</span>
        </div>
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <span>One-click copy trading</span>
        </div>
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <span>Performance tracking</span>
        </div>
      </div>
    </div>
  );
}
