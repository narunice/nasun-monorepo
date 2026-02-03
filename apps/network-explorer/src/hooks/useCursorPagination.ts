import { useState, useCallback } from 'react';

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
  const [cursorHistory, setCursorHistory] = useState<(TCursor | undefined)[]>([undefined]);
  const [pageIndex, setPageIndex] = useState(0);

  const handleNextPage = useCallback((nextCursor: TCursor) => {
    setCursorHistory((prev) => {
      if (pageIndex + 1 >= prev.length) {
        return [...prev, nextCursor];
      }
      return prev;
    });
    setPageIndex((prev) => prev + 1);
    setCursor(nextCursor);
  }, [pageIndex]);

  const handlePrevPage = useCallback(() => {
    if (pageIndex > 0) {
      setPageIndex((prev) => prev - 1);
      setCursor(cursorHistory[pageIndex - 1]);
    }
  }, [pageIndex, cursorHistory]);

  return { cursor, pageIndex, handleNextPage, handlePrevPage };
}
