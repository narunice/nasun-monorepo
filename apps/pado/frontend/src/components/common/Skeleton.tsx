/**
 * Skeleton loading placeholders for tables, lists, cards, and page sections.
 */

// ===== Primitives =====

interface SkeletonBoxProps {
  className?: string;
}

/** Generic animated skeleton block */
export function SkeletonBox({ className = 'h-4 w-full' }: SkeletonBoxProps) {
  return <div className={`animate-pulse bg-theme-bg-tertiary rounded ${className}`} />;
}

// ===== Table / Row =====

interface SkeletonRowProps {
  cols?: number;
  className?: string;
}

export function SkeletonRow({ cols = 3, className = '' }: SkeletonRowProps) {
  return (
    <div
      className={`grid gap-2 animate-pulse ${className}`}
      style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
    >
      {Array.from({ length: cols }).map((_, i) => (
        <div key={i} className="h-4 bg-theme-bg-tertiary rounded" />
      ))}
    </div>
  );
}

interface SkeletonTableProps {
  rows?: number;
  cols?: number;
  className?: string;
}

export function SkeletonTable({ rows = 5, cols = 3, className = '' }: SkeletonTableProps) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} cols={cols} />
      ))}
    </div>
  );
}

// ===== Card =====

interface SkeletonCardProps {
  className?: string;
  lines?: number;
}

/** Skeleton card with optional line count */
export function SkeletonCard({ className = '', lines = 3 }: SkeletonCardProps) {
  return (
    <div className={`bg-theme-bg-secondary border border-theme-border rounded-xl p-4 animate-pulse ${className}`}>
      <div className="h-5 bg-theme-bg-tertiary rounded w-1/3 mb-4" />
      <div className="h-8 bg-theme-bg-tertiary rounded w-2/3 mb-3" />
      <div className="space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <div key={i} className="h-4 bg-theme-bg-tertiary rounded" style={{ width: `${80 - i * 15}%` }} />
        ))}
      </div>
    </div>
  );
}

// ===== Market Row =====

/** Skeleton for a market/token list item */
export function SkeletonMarketRow() {
  return (
    <div className="flex items-center justify-between py-2.5 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-theme-bg-tertiary rounded-full" />
        <div>
          <div className="h-4 bg-theme-bg-tertiary rounded w-16 mb-1" />
          <div className="h-3 bg-theme-bg-tertiary rounded w-10" />
        </div>
      </div>
      <div className="text-right">
        <div className="h-4 bg-theme-bg-tertiary rounded w-20 mb-1" />
        <div className="h-3 bg-theme-bg-tertiary rounded w-12 ml-auto" />
      </div>
    </div>
  );
}

// ===== Stat Grid =====

interface SkeletonStatGridProps {
  count?: number;
  cols?: number;
  className?: string;
}

/** Skeleton for a grid of stat boxes */
export function SkeletonStatGrid({ count = 4, cols = 2, className = '' }: SkeletonStatGridProps) {
  return (
    <div
      className={`grid gap-3 animate-pulse ${className}`}
      style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-theme-bg-tertiary rounded-lg p-3">
          <div className="h-3 bg-theme-bg-quaternary rounded w-12 mb-2" />
          <div className="h-5 bg-theme-bg-quaternary rounded w-16" />
        </div>
      ))}
    </div>
  );
}
