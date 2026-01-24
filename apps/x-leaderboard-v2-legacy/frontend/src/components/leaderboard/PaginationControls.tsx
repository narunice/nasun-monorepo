import React, { FormEvent, memo } from "react";
import { PaginationRange } from "@/types";
import { CSS_CLASSES } from "@/constants";
import { useTranslation } from "react-i18next";

interface PaginationControlsProps {
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

const PaginationControls: React.FC<PaginationControlsProps> = memo(
  ({
    currentPage,
    totalPages,
    totalEntries,
    pageInput,
    paginationRange,
    onPageChange,
    onPageInputChange,
    onPageInputSubmit,
  }) => {
    const { t } = useTranslation("leaderboard");

    return (
      <div className="flex items-center justify-between mt-4">
        <div className="text-gray-400">
          {t("pagination.pageOf", { current: currentPage, total: totalPages, totalEntries })}
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => onPageChange(1)}
            disabled={currentPage === 1}
            className={`${CSS_CLASSES.PAGINATION_BUTTON} ${CSS_CLASSES.PAGINATION_BUTTON_DISABLED} bg-gray-700 hover:bg-gray-600 hover:scale-105 active:scale-95 text-gray-200`}
          >
            {t("pagination.first")}
          </button>
          <button
            onClick={() => onPageChange(currentPage - 1)}
            className={`${CSS_CLASSES.PAGINATION_BUTTON} ${CSS_CLASSES.PAGINATION_BUTTON_DISABLED} bg-gray-700 hover:bg-gray-600 hover:scale-105 active:scale-95 text-gray-200`}
          >
            {t("pagination.prev")}
          </button>

          {paginationRange.map((page, index) => (
            <button
              key={index}
              onClick={() => typeof page === "number" && onPageChange(page)}
              disabled={typeof page !== "number" || page === currentPage}
              className={`${CSS_CLASSES.PAGINATION_BUTTON} disabled:cursor-not-allowed ${
                page === currentPage
                  ? "bg-nasun-c3 text-black "
                  : typeof page === "number"
                  ? "bg-gray-700 hover:bg-gray-600 hover:scale-105 active:scale-95 text-gray-200"
                  : "bg-transparent"
              }`}
            >
              {page}
            </button>
          ))}

          <button
            onClick={() => onPageChange(currentPage + 1)}
            className={`${CSS_CLASSES.PAGINATION_BUTTON} ${CSS_CLASSES.PAGINATION_BUTTON_DISABLED} bg-gray-700 hover:bg-gray-600 hover:scale-105 active:scale-95 text-gray-200`}
          >
            {t("pagination.next")}
          </button>
          <button
            onClick={() => onPageChange(totalPages)}
            disabled={currentPage === totalPages}
            className={`${CSS_CLASSES.PAGINATION_BUTTON} ${CSS_CLASSES.PAGINATION_BUTTON_DISABLED} bg-gray-700 hover:bg-gray-600 hover:scale-105 active:scale-95 text-gray-200`}
          >
            {t("pagination.last")}
          </button>

          <form onSubmit={onPageInputSubmit} className="flex items-center space-x-1">
            <input
              type="number"
              value={pageInput}
              onChange={(e) => onPageInputChange(e.target.value)}
              className="w-16 px-2 py-1 border border-gray-600 rounded-lg bg-gray-800 text-white focus:border-nasun-c3"
              min="1"
              max={totalPages}
            />
            <button
              type="submit"
              className={`${CSS_CLASSES.PAGINATION_BUTTON} bg-gray-700 text-gray-200 hover:bg-gray-600 hover:scale-105 active:scale-95`}
            >
              {t("pagination.go")}
            </button>
          </form>
        </div>
      </div>
    );
  }
);

PaginationControls.displayName = "PaginationControls";

export default PaginationControls;
