import { useState, useRef, useEffect, useCallback } from "react";

const HIGHLIGHT_DURATION_MS = 6000;

interface UseHighlightRowOptions {
  dataAttribute: string;
  pageSize: number;
  page: number;
  setPage: (page: number) => void;
}

export function useHighlightRow({ dataAttribute, pageSize, page, setPage }: UseHighlightRowOptions) {
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [pendingScrollId, setPendingScrollId] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  // Scroll after page change: triggered by [page, pendingScrollId] - no isLoading dependency
  // because client-side slicing means the data is already available after page state updates.
  useEffect(() => {
    if (!pendingScrollId) return;
    const id = pendingScrollId;
    const timer = setTimeout(() => {
      const row = document.querySelector(`[${dataAttribute}="${CSS.escape(id)}"]`);
      if (row) row.scrollIntoView({ behavior: "smooth", block: "center" });
      setPendingScrollId(null);
    }, 100);
    return () => clearTimeout(timer);
  }, [page, pendingScrollId, dataAttribute]);

  const selectRow = useCallback(
    (id: string, rank: number) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);

      setHighlightedId(id);

      const targetPage = Math.ceil(rank / pageSize);
      if (targetPage !== page) {
        setPendingScrollId(id);
        setPage(targetPage);
      } else {
        setTimeout(() => {
          const row = document.querySelector(`[${dataAttribute}="${CSS.escape(id)}"]`);
          if (row) row.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 100);
      }

      timeoutRef.current = setTimeout(() => {
        setHighlightedId(null);
      }, HIGHLIGHT_DURATION_MS);
    },
    [page, pageSize, setPage, dataAttribute],
  );

  return { highlightedId, selectRow };
}
