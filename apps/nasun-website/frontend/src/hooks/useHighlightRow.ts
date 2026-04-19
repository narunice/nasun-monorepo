import { useState, useRef, useEffect, useCallback } from "react";

const HIGHLIGHT_DURATION_MS = 6000;
const DATA_ATTR_RE = /^data-[\w-]+$/;

interface UseHighlightRowOptions {
  dataAttribute: string;
  pageSize: number;
  page: number;
  setPage: (page: number) => void;
}

function scrollToRow(dataAttribute: string, id: string): void {
  const row = document.querySelector(`[${dataAttribute}="${CSS.escape(id)}"]`);
  if (row) row.scrollIntoView({ behavior: "smooth", block: "center" });
}

// Double rAF ensures layout has settled before scrolling.
function rafScroll(dataAttribute: string, id: string): () => void {
  let cancelled = false;
  const raf1 = requestAnimationFrame(() => {
    if (cancelled) return;
    requestAnimationFrame(() => {
      if (cancelled) return;
      scrollToRow(dataAttribute, id);
    });
  });
  return () => {
    cancelled = true;
    cancelAnimationFrame(raf1);
  };
}

export function useHighlightRow({ dataAttribute, pageSize, page, setPage }: UseHighlightRowOptions) {
  if (!DATA_ATTR_RE.test(dataAttribute)) {
    throw new Error(`useHighlightRow: invalid dataAttribute "${dataAttribute}"`);
  }

  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [pendingScrollId, setPendingScrollId] = useState<string | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollCancelRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
      if (scrollCancelRef.current) scrollCancelRef.current();
    };
  }, []);

  // Scroll after page change - triggered by page/pendingScrollId state (not isLoading,
  // since client-side slicing means data is already present after page state updates).
  useEffect(() => {
    if (!pendingScrollId) return;
    const id = pendingScrollId;
    const cancel = rafScroll(dataAttribute, id);
    scrollCancelRef.current = cancel;
    setPendingScrollId(null);
    return cancel;
  }, [page, pendingScrollId, dataAttribute]);

  const selectRow = useCallback(
    (id: string, rank: number) => {
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
      if (scrollCancelRef.current) scrollCancelRef.current();

      setHighlightedId(id);

      const targetPage = Math.ceil(rank / pageSize);
      if (targetPage !== page) {
        setPendingScrollId(id);
        setPage(targetPage);
      } else {
        const cancel = rafScroll(dataAttribute, id);
        scrollCancelRef.current = cancel;
      }

      highlightTimerRef.current = setTimeout(() => {
        setHighlightedId(null);
      }, HIGHLIGHT_DURATION_MS);
    },
    [page, pageSize, setPage, dataAttribute],
  );

  return { highlightedId, selectRow };
}
