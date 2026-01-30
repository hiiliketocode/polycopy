"use client";

import { cn } from "@/lib/utils";

interface ProgressIndicatorProps {
  currentStep: number;
  totalSteps: number;
}

export function ProgressIndicator({
  currentStep,
  totalSteps,
}: ProgressIndicatorProps) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: totalSteps }, (_, i) => (
        <div
          key={i}
          className={cn(
            "h-1.5 rounded-full transition-all duration-300",
            i + 1 === currentStep
              ? "w-5 bg-primary"
              : i + 1 < currentStep
                ? "w-1.5 bg-primary/60"
                : "w-1.5 bg-border"
          )}
        />
      ))}
    </div>
  );
}
