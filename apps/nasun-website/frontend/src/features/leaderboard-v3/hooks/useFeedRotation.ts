import { useState, useEffect } from "react";
import type { FeaturedFeedItem } from "../types";

const ROTATION_INTERVAL = 20000; // 20 seconds

export function useFeedRotation(initialItems: FeaturedFeedItem[] | undefined) {
  const [rotatedItems, setRotatedItems] = useState<FeaturedFeedItem[]>([]);

  // Initialize/sync rotatedItems when data changes
  useEffect(() => {
    if (initialItems) {
      setRotatedItems(initialItems);
    }
  }, [initialItems]);

  // Auto-rotation timer
  useEffect(() => {
    if (rotatedItems.length <= 1) return;

    const interval = setInterval(() => {
      setRotatedItems((prev) => {
        const [first, ...rest] = prev;
        return [...rest, first];
      });
    }, ROTATION_INTERVAL);

    return () => clearInterval(interval);
  }, [rotatedItems.length]);

  return rotatedItems;
}
