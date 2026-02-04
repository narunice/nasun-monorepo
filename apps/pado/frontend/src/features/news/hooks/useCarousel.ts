import { useState, useEffect, useCallback } from 'react';

export function useCarousel(itemCount: number, intervalMs = 5000) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  // Reset index when item count changes
  useEffect(() => {
    if (currentIndex >= itemCount) {
      setCurrentIndex(0);
    }
  }, [itemCount, currentIndex]);

  // Auto-advance timer
  useEffect(() => {
    if (paused || itemCount <= 1) return;
    const timer = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % itemCount);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [itemCount, intervalMs, paused]);

  const goTo = useCallback((index: number) => {
    setCurrentIndex(Math.max(0, Math.min(index, itemCount - 1)));
  }, [itemCount]);

  return { currentIndex, goTo, paused, setPaused };
}
