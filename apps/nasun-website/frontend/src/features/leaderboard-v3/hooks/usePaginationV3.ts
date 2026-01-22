/**
 * usePaginationV3 Hook
 *
 * Pagination state management for Leaderboard V3.
 * Based on legacy usePagination hook.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';

// Pagination configuration
const PAGINATION_CONFIG = {
  DELTA: 2,
  FIRST_PAGE: 1,
  ELLIPSIS: '...',
} as const;

export type PaginationRange = (number | string)[];

// Generate pagination number list with ellipsis
const getPaginationRange = (currentPage: number, totalPages: number): PaginationRange => {
  if (totalPages <= 1) return [PAGINATION_CONFIG.FIRST_PAGE];

  const delta = PAGINATION_CONFIG.DELTA;
  const left = currentPage - delta;
  const right = currentPage + delta;
  const range: number[] = [];

  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= left && i <= right)) {
      range.push(i);
    }
  }

  const rangeWithDots: (number | string)[] = [];
  let last: number | null = null;

  for (const page of range) {
    if (last) {
      if (page - last === 2) {
        rangeWithDots.push(last + 1);
      } else if (page - last !== 1) {
        rangeWithDots.push(PAGINATION_CONFIG.ELLIPSIS);
      }
    }
    rangeWithDots.push(page);
    last = page;
  }

  return rangeWithDots;
};

export const usePaginationV3 = (totalItems: number, itemsPerPage: number) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageInput, setPageInput] = useState('1');

  const totalPages = useMemo(() => {
    if (totalItems === 0) return 1;
    return Math.ceil(totalItems / itemsPerPage);
  }, [totalItems, itemsPerPage]);

  const paginationRange = useMemo(
    () => getPaginationRange(currentPage, totalPages),
    [currentPage, totalPages]
  );

  // Adjust currentPage when totalPages decreases
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
      setPageInput(totalPages.toString());
    }
  }, [totalPages, currentPage]);

  useEffect(() => {
    setPageInput(currentPage.toString());
  }, [currentPage]);

  const handlePageChange = useCallback(
    (newPage: number) => {
      if (newPage < 1 || newPage > totalPages || newPage === currentPage) {
        return false;
      }
      setCurrentPage(newPage);
      return true;
    },
    [currentPage, totalPages]
  );

  const handlePageInputSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const pageNum = parseInt(pageInput, 10);
      if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= totalPages) {
        handlePageChange(pageNum);
      }
    },
    [pageInput, totalPages, handlePageChange]
  );

  const handlePageInputChange = useCallback((value: string) => {
    setPageInput(value);
  }, []);

  const resetToFirstPage = useCallback(() => {
    setCurrentPage(1);
    setPageInput('1');
  }, []);

  return {
    currentPage,
    setCurrentPage,
    totalPages,
    pageInput,
    paginationRange,
    handlePageChange,
    handlePageInputSubmit,
    handlePageInputChange,
    resetToFirstPage,
    hasPrevPage: currentPage > 1,
    hasNextPage: currentPage < totalPages,
  };
};
