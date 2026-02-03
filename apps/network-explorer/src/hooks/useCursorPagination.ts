import { useState, useCallback, useRef } from 'react';

interface CursorPaginationResult<TCursor> {
  cursor: TCursor | undefined;
  pageIndex: number;
  handleNextPage: (nextCursor: TCursor) => void;
  handlePrevPage: () => void;
}

/**
 * Shared cursor-based pagination state for list pages.
 * Used by Transactions and Checkpoints pages.
 */
export function useCursorPagination<TCursor = string>(): CursorPaginationResult<TCursor> {
  const [cursor, setCursor] = useState<TCursor | undefined>(undefined);
  const [pageIndex, setPageIndex] = useState(0);
  const cursorHistoryRef = useRef<(TCursor | undefined)[]>([undefined]);

  const handleNextPage = useCallback((nextCursor: TCursor) => {
    setPageIndex((prev) => {
      const nextIndex = prev + 1;
      if (nextIndex >= cursorHistoryRef.current.length) {
        cursorHistoryRef.current = [...cursorHistoryRef.current, nextCursor];
      }
      return nextIndex;
    });
    setCursor(nextCursor);
  }, []);

  const handlePrevPage = useCallback(() => {
    setPageIndex((prev) => {
      if (prev > 0) {
        const newIndex = prev - 1;
        setCursor(cursorHistoryRef.current[newIndex]);
        return newIndex;
      }
      return prev;
    });
  }, []);

  return { cursor, pageIndex, handleNextPage, handlePrevPage };
}
