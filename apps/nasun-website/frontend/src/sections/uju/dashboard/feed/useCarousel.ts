import { useState, useEffect, useCallback } from "react";

export function useCarousel(itemCount: number, intervalMs = 9000) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [skipTransition, setSkipTransition] = useState(false);

  useEffect(() => {
    if (currentIndex > itemCount) setCurrentIndex(0);
  }, [itemCount, currentIndex]);

  useEffect(() => {
    if (paused || itemCount <= 1) return;
    const t = setInterval(() => {
      setCurrentIndex((prev) => (prev >= itemCount ? prev : prev + 1));
    }, intervalMs);
    return () => clearInterval(t);
  }, [itemCount, intervalMs, paused]);

  useEffect(() => {
    if (skipTransition) requestAnimationFrame(() => setSkipTransition(false));
  }, [skipTransition]);

  const goTo = useCallback(
    (index: number) => setCurrentIndex(Math.max(0, Math.min(index, itemCount))),
    [itemCount]
  );

  const snapTo = useCallback((index: number) => {
    setSkipTransition(true);
    setCurrentIndex(index);
  }, []);

  return { currentIndex, goTo, snapTo, paused, setPaused, skipTransition };
}
