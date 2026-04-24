interface Props {
  page: number;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onFirst: () => void;
  isLoading?: boolean;
}

export function Pagination({ page, hasPrev, hasNext, onPrev, onNext, onFirst, isLoading }: Props) {
  const btnBase =
    'px-3 py-1.5 text-sm rounded border border-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed';
  const btnActive = 'bg-neutral-800 text-neutral-200 hover:bg-neutral-700';

  return (
    <div className="flex items-center gap-2 mt-4">
      <button
        onClick={onFirst}
        disabled={!hasPrev || isLoading}
        className={`${btnBase} ${btnActive}`}
        title="First page"
      >
        &#8676; First
      </button>
      <button
        onClick={onPrev}
        disabled={!hasPrev || isLoading}
        className={`${btnBase} ${btnActive}`}
      >
        &#8592; Prev
      </button>
      <span className="text-sm text-neutral-400 px-2">
        Page {page}
        {isLoading && <span className="ml-1 text-neutral-500">...</span>}
      </span>
      <button
        onClick={onNext}
        disabled={!hasNext || isLoading}
        className={`${btnBase} ${btnActive}`}
      >
        Next &#8594;
      </button>
      <span
        className="text-xs text-neutral-600 ml-1"
        title="DynamoDB cursor-based pagination does not support random page jumps"
      >
        (no jump)
      </span>
    </div>
  );
}
