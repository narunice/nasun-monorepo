import { useState, useCallback } from 'react';

export type ChatTextSize = 0 | 1 | 2;

const STORAGE_KEY = 'pado:chat:textSize';
const MIN_SIZE: ChatTextSize = 0;
const MAX_SIZE: ChatTextSize = 2;

function loadSize(): ChatTextSize {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === '1') return 1;
    if (stored === '2') return 2;
    return 0;
  } catch {
    return 0;
  }
}

export function useChatTextSize() {
  const [textSize, setTextSize] = useState<ChatTextSize>(loadSize);

  const increase = useCallback(() => {
    setTextSize((prev) => {
      const next = Math.min(prev + 1, MAX_SIZE) as ChatTextSize;
      localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  }, []);

  const decrease = useCallback(() => {
    setTextSize((prev) => {
      const next = Math.max(prev - 1, MIN_SIZE) as ChatTextSize;
      localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  }, []);

  return {
    textSize,
    increase,
    decrease,
    isMin: textSize === MIN_SIZE,
    isMax: textSize === MAX_SIZE,
  };
}
