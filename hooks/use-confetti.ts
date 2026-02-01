"use client";

import { useCallback, useRef } from "react";
import type { Options } from "canvas-confetti";

const DEFAULT_CONFETTI_CONFIG: Options = {
  particleCount: 80,
  spread: 55,
  origin: { y: 0.6 },
};

export function useConfetti() {
  const confettiRef = useRef<((options?: Options) => void) | null>(null);
  const loadingRef = useRef(false);

  const triggerConfetti = useCallback(async (overrides?: Options) => {
    // Lazy load confetti only when user clicks (improves initial LCP)
    if (!confettiRef.current && !loadingRef.current) {
      loadingRef.current = true;
      try {
        const module = await import("canvas-confetti");
        confettiRef.current = module.default || module;
      } catch (error) {
        console.error("Failed to load confetti", error);
        loadingRef.current = false;
        return;
      }
    }

    if (confettiRef.current) {
      confettiRef.current({ ...DEFAULT_CONFETTI_CONFIG, ...overrides });
    }
  }, []);

  return { triggerConfetti };
}
