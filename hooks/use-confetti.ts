"use client";

import { useCallback, useEffect, useRef } from "react";
import type { Options } from "canvas-confetti";

const DEFAULT_CONFETTI_CONFIG: Options = {
  particleCount: 80,
  spread: 55,
  origin: { y: 0.6 },
};

export function useConfetti() {
  const confettiRef = useRef<((options?: Options) => void) | null>(null);

  useEffect(() => {
    const loadConfetti = async () => {
      try {
        const module = await import("canvas-confetti");
        confettiRef.current = module.default || module;
      } catch (error) {
        console.error("Failed to load confetti", error);
      }
    };

    loadConfetti();
  }, []);

  const triggerConfetti = useCallback((overrides?: Options) => {
    if (!confettiRef.current) return;
    confettiRef.current({ ...DEFAULT_CONFETTI_CONFIG, ...overrides });
  }, []);

  return { triggerConfetti };
}
