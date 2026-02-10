import { useState, useEffect, useCallback } from 'react';

export function useCarousel(itemCount: number, intervalMs = 5000) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [skipTransition, setSkipTransition] = useState(false);

  // Reset index when item count changes
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (currentIndex > itemCount) {
      setCurrentIndex(0);
    }
  }, [itemCount, currentIndex]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Auto-advance timer — advances up to itemCount (clone position)
  useEffect(() => {
    if (paused || itemCount <= 1) return;
    const timer = setInterval(() => {
      setCurrentIndex(prev => prev >= itemCount ? prev : prev + 1);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [itemCount, intervalMs, paused]);

  // Re-enable transition after instant snap
  useEffect(() => {
    if (skipTransition) {
      requestAnimationFrame(() => {
        setSkipTransition(false);
      });
    }
  }, [skipTransition]);

  const goTo = useCallback((index: number) => {
    setCurrentIndex(Math.max(0, Math.min(index, itemCount)));
  }, [itemCount]);

  // Instant reposition without animation
  const snapTo = useCallback((index: number) => {
    setSkipTransition(true);
    setCurrentIndex(index);
  }, []);

  return { currentIndex, goTo, snapTo, paused, setPaused, skipTransition };
}
