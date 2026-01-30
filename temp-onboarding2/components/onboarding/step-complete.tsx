"use client";

import { ArrowRight, Sparkles } from "lucide-react";

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
      {/* Celebration Visual */}
      <div className="relative mb-8">
        {/* Decorative dots */}
        <div className="absolute -top-4 -left-8 w-3 h-3 bg-primary rounded-full opacity-60" />
        <div className="absolute -top-2 right-0 w-2 h-2 bg-polycopy-success rounded-full opacity-80" />
        <div className="absolute -bottom-2 -left-4 w-2.5 h-2.5 bg-polycopy-info rounded-full opacity-70" />
        <div className="absolute bottom-4 -right-6 w-2 h-2 bg-primary rounded-full opacity-50" />
        
        {/* Main success icon */}
        <div className="w-24 h-24 md:w-28 md:h-28 bg-gradient-to-br from-polycopy-success/20 to-polycopy-success/5 rounded-full flex items-center justify-center border-2 border-polycopy-success/30">
          <div className="w-16 h-16 md:w-18 md:h-18 bg-polycopy-success rounded-full flex items-center justify-center">
            <svg 
              className="w-8 h-8 md:w-10 md:h-10 text-white" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor" 
              strokeWidth={3}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
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

      {/* CTA Button */}
      <button
        type="button"
        onClick={onGoToFeed}
        disabled={isLoading}
        className="px-10 py-4 bg-primary text-primary-foreground rounded-xl font-semibold text-lg hover:bg-primary/90 transition-all hover:scale-105 flex items-center gap-3 disabled:opacity-50 disabled:hover:scale-100 shadow-lg shadow-primary/25"
      >
        {isLoading ? (
          <>
            <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
            Setting up...
          </>
        ) : (
          <>
            Go to Your Feed
            <ArrowRight className="w-5 h-5" />
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
