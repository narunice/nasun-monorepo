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

const buttonBase = 'px-3 py-1 text-sm rounded-sm transition-all';
const buttonDisabled = 'disabled:opacity-50 disabled:cursor-not-allowed';
const buttonStyle = `${buttonBase} ${buttonDisabled} bg-gray-700 hover:bg-gray-600 hover:scale-105 active:scale-95 text-gray-200`;

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
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-4">
        {/* Left: Page info */}
        <div className="text-gray-400 text-sm">
          {t("v3.pagination.page", { current: currentPage, total: totalPages })}
        </div>

        {/* Right: Navigation */}
        <div className="flex items-center gap-1 flex-wrap justify-center">
          {/* First */}
          <button
            onClick={() => onPageChange(1)}
            disabled={!hasPrev}
            className={buttonStyle}
          >
            {t("v3.pagination.first")}
          </button>

          {/* Prev */}
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={!hasPrev}
            className={buttonStyle}
          >
            {t("v3.pagination.prev")}
          </button>

          {/* Page numbers */}
          {paginationRange.map((page, index) => (
            <button
              key={index}
              onClick={() => typeof page === 'number' && onPageChange(page)}
              disabled={typeof page !== 'number' || page === currentPage}
              className={`${buttonBase} disabled:cursor-not-allowed ${
                page === currentPage
                  ? 'bg-nasun-c7 text-black font-medium'
                  : typeof page === 'number'
                    ? 'bg-gray-700 hover:bg-gray-600 hover:scale-105 active:scale-95 text-gray-200'
                    : 'bg-transparent text-gray-400 cursor-default'
              }`}
            >
              {page}
            </button>
          ))}

          {/* Next */}
          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={!hasNext}
            className={buttonStyle}
          >
            {t("v3.pagination.next")}
          </button>

          {/* Last */}
          <button
            onClick={() => onPageChange(totalPages)}
            disabled={!hasNext}
            className={buttonStyle}
          >
            {t("v3.pagination.last")}
          </button>

          {/* Direct input */}
          <form onSubmit={onPageInputSubmit} className="flex items-center gap-1 ml-2">
            <input
              type="number"
              value={pageInput}
              onChange={(e) => onPageInputChange(e.target.value)}
              className="w-14 px-2 py-1 text-sm border border-gray-600 rounded-sm bg-gray-800 text-white focus:border-nasun-c7 focus:outline-none"
              min="1"
              max={totalPages}
            />
            <button type="submit" className={buttonStyle}>
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
