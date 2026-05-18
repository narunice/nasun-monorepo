interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

/**
 * Page navigation strip with first/current+/-1/last + ellipsis.
 * Pattern lifted from apps/pado/.../leaderboard/components/Pagination.tsx,
 * restyled to the gostop gold/ink theme.
 */
export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  // Build page numbers to display: always show first, last, current +/- 1, with ellipsis.
  const pages: number[] = [];
  const addPage = (p: number) => {
    if (p >= 1 && p <= totalPages && !pages.includes(p)) {
      pages.push(p);
    }
  };

  addPage(1);
  for (let p = currentPage - 1; p <= currentPage + 1; p++) {
    addPage(p);
  }
  addPage(totalPages);

  // Insert ellipsis between non-consecutive pages.
  const withEllipsis: (number | 'ellipsis')[] = [];
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    const prev = pages[i - 1];
    if (prev !== undefined && p - prev > 1) {
      withEllipsis.push('ellipsis');
    }
    withEllipsis.push(p);
  }

  return (
    <div className="flex items-center justify-center gap-1 py-3">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage <= 1}
        aria-label="Previous page"
        className="px-2 py-1 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-neutral-300 hover:text-gold-200 hover:bg-gold-400/10"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 19l-7-7 7-7"
          />
        </svg>
      </button>

      {withEllipsis.map((item, idx) => {
        if (item === 'ellipsis') {
          return (
            <span
              key={`e-${idx}`}
              className="px-1 text-sm text-neutral-400 select-none"
            >
              …
            </span>
          );
        }
        const page = item;
        const isActive = page === currentPage;
        return (
          <button
            key={page}
            onClick={() => onPageChange(page)}
            aria-current={isActive ? 'page' : undefined}
            className={`min-w-[32px] px-2 py-1 text-sm font-medium rounded transition-colors ${
              isActive
                ? 'bg-gold-400/15 text-gold-200 shadow-[inset_0_0_0_1px_rgba(212,175,55,0.3)]'
                : 'text-neutral-300 hover:text-gold-200 hover:bg-gold-400/10'
            }`}
          >
            {page}
          </button>
        );
      })}

      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage >= totalPages}
        aria-label="Next page"
        className="px-2 py-1 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-neutral-300 hover:text-gold-200 hover:bg-gold-400/10"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5l7 7-7 7"
          />
        </svg>
      </button>
    </div>
  );
}
