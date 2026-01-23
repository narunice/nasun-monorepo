import { useState, useEffect, useRef } from "react";

export function useStickySidebar() {
  const rightColumnRef = useRef<HTMLDivElement>(null);
  const feedContainerRef = useRef<HTMLDivElement>(null);
  const [rightColumnHeight, setRightColumnHeight] = useState<number>(0);
  const [isFeedOverflowing, setIsFeedOverflowing] = useState(false);

  // Track right column height
  useEffect(() => {
    const el = rightColumnRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setRightColumnHeight(entry.contentRect.height);
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Check overflow
  useEffect(() => {
    const el = feedContainerRef.current;
    if (!el) return;

    const checkOverflow = () => {
      setIsFeedOverflowing(el.scrollHeight > el.clientHeight + 1);
    };

    checkOverflow();
    const observer = new ResizeObserver(checkOverflow);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return {
    rightColumnRef,
    feedContainerRef,
    rightColumnHeight,
    isFeedOverflowing,
  };
}
