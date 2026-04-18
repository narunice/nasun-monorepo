/**
 * PaginationControlsV3 Component
 *
 * Pagination UI for Leaderboard V3.
 * Based on legacy PaginationControls component.
 */

import React, { FormEvent, memo } from 'react';
import { useTranslation } from "react-i18next";
import type { PaginationRange } from '../hooks/usePaginationV3';

interface PaginationControlsV3Props {
  currentPage: number;
  totalPages: number;
  totalEntries: number;
  pageInput: string;
  paginationRange: PaginationRange;
  hasNext: boolean;
  hasPrev: boolean;
  onPageChange: (page: number) => void;
  onPageInputChange: (value: string) => void;
  onPageInputSubmit: (e: FormEvent) => void;
}

const navBtnBase = 'px-4 py-1.5 text-sm rounded-sm transition-all border disabled:opacity-40 disabled:cursor-not-allowed';
const navBtnStyle = `${navBtnBase} border-nasun-nw3/40 bg-nasun-nw3/10 text-nasun-nw4 hover:bg-nasun-nw2/20 hover:text-nasun-white hover:border-nasun-nw1/40 active:scale-95`;

const PaginationControlsV3: React.FC<PaginationControlsV3Props> = memo(
  ({
    currentPage,
    totalPages,
    pageInput,
    paginationRange,
    hasPrev,
    hasNext,
    onPageChange,
    onPageInputChange,
    onPageInputSubmit,
  }) => {
    const { t } = useTranslation("leaderboard");
    return (
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Left: Page info */}
        <p className="text-nasun-nw4 text-sm">
          {t("v3.pagination.page", { current: currentPage, total: totalPages })}
        </p>

        {/* Right: Navigation */}
        <div className="flex items-center gap-1.5 flex-wrap justify-center">
          {/* Prev */}
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={!hasPrev}
            className={navBtnStyle}
          >
            {t("v3.pagination.prev")}
          </button>

          {/* Page numbers */}
          {paginationRange.map((page, index) => (
            <button
              key={index}
              onClick={() => typeof page === 'number' && onPageChange(page)}
              disabled={typeof page !== 'number' || page === currentPage}
              className={`px-3 py-1.5 text-sm rounded-sm transition-all border disabled:cursor-not-allowed ${
                page === currentPage
                  ? 'bg-nasun-nw2/50 text-nasun-white font-semibold border-nasun-nw1/50'
                  : typeof page === 'number'
                    ? 'border-nasun-nw3/40 bg-nasun-nw3/10 text-nasun-nw4 hover:bg-nasun-nw2/20 hover:text-nasun-white hover:border-nasun-nw1/40 active:scale-95'
                    : 'border-transparent bg-transparent text-nasun-nw4 cursor-default'
              }`}
            >
              {page}
            </button>
          ))}

          {/* Next */}
          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={!hasNext}
            className={navBtnStyle}
          >
            {t("v3.pagination.next")}
          </button>

          {/* Direct input */}
          <form onSubmit={onPageInputSubmit} className="flex items-center gap-1.5 ml-2 border-l border-nasun-nw3/30 pl-3">
            <input
              type="number"
              value={pageInput}
              onChange={(e) => onPageInputChange(e.target.value)}
              className="w-14 px-2 py-1.5 text-sm border border-nasun-nw3/40 rounded-sm bg-nasun-nw3/10 text-nasun-white focus:border-nasun-nw1/60 focus:outline-none"
              min="1"
              max={totalPages}
            />
            <button type="submit" className={navBtnStyle}>
              {t("v3.pagination.go")}
            </button>
          </form>
        </div>
      </div>
    );
  }
);

PaginationControlsV3.displayName = 'PaginationControlsV3';

export default PaginationControlsV3;
