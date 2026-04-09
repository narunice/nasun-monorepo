interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ currentPage, totalPages, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  // Build page numbers to display: always show first, last, current +/- 1, with ellipsis
  const pages: (number | 'ellipsis')[] = [];
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

  // Insert ellipsis between non-consecutive pages
  const withEllipsis: (number | 'ellipsis')[] = [];
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i] as number;
    const prev = pages[i - 1] as number | undefined;
    if (prev !== undefined && p - prev > 1) {
      withEllipsis.push('ellipsis');
    }
    withEllipsis.push(p);
  }

  return (
    <div className="flex items-center justify-center gap-1 py-3">
      {/* Prev */}
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage <= 1}
        className="px-2 py-1 text-xs rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-theme-text-muted hover:text-theme-text-primary hover:bg-theme-bg-tertiary"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      {/* Page numbers */}
      {withEllipsis.map((item, idx) => {
        if (item === 'ellipsis') {
          return (
            <span key={`e-${idx}`} className="px-1 text-xs text-theme-text-muted select-none">
              ...
            </span>
          );
        }
        const page = item;
        const isActive = page === currentPage;
        return (
          <button
            key={page}
            onClick={() => onPageChange(page)}
            className={`min-w-[28px] px-1.5 py-1 text-xs font-medium rounded transition-colors ${
              isActive
                ? 'bg-pd3/10 text-pd3'
                : 'text-theme-text-muted hover:text-theme-text-primary hover:bg-theme-bg-tertiary'
            }`}
          >
            {page}
          </button>
        );
      })}

      {/* Next */}
      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage >= totalPages}
        className="px-2 py-1 text-xs rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-theme-text-muted hover:text-theme-text-primary hover:bg-theme-bg-tertiary"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  );
}
