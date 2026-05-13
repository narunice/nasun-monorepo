import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Spinner } from '../common/Spinner';

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function UserIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

export interface LeaderboardSearchResult {
  id: string;
  primaryLabel: string;
  secondaryLabel?: string;
  rank?: number;
  profileImageUrl?: string | null;
}

interface LeaderboardSearchBoxProps<T> {
  entries: T[];
  filterFn: (entry: T, query: string) => boolean;
  toResult: (entry: T) => LeaderboardSearchResult;
  onSelect: (result: LeaderboardSearchResult) => void;
  placeholder?: string;
  disabled?: boolean;
}

function isSafeImageUrl(url: string | null | undefined): url is string {
  return typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'));
}

export function LeaderboardSearchBox<T>({
  entries,
  filterFn,
  toResult,
  onSelect,
  placeholder = 'Search by handle, name, or address...',
  disabled = false,
}: LeaderboardSearchBoxProps<T>) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const results: LeaderboardSearchResult[] = useMemo(() => {
    if (debouncedQuery.length < 2) return [];
    const q = debouncedQuery.toLowerCase();
    return entries.filter((e) => filterFn(e, q)).slice(0, 8).map(toResult);
  }, [entries, debouncedQuery, filterFn, toResult]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    setIsOpen(value.length >= 2);
  };

  const handleSelect = useCallback(
    (result: LeaderboardSearchResult) => {
      setQuery(result.primaryLabel);
      setIsOpen(false);
      onSelect(result);
    },
    [onSelect],
  );

  const handleClear = () => {
    setQuery('');
    setDebouncedQuery('');
    setIsOpen(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && results.length > 0) {
      handleSelect(results[0]);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const showDropdown = isOpen && query.length >= 2;
  const isSearching = debouncedQuery !== query;

  return (
    <div ref={containerRef} className="relative w-full sm:w-80">
      <div className="relative">
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-theme-text-muted" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => query.length >= 2 && setIsOpen(true)}
          placeholder={disabled ? 'Loading data...' : placeholder}
          disabled={disabled}
          className="w-full bg-theme-bg-secondary border border-theme-border rounded-lg pl-10 pr-8 py-1.5 text-sm text-theme-text-primary placeholder-theme-text-muted focus:outline-none focus:border-pd3/60 disabled:opacity-50 disabled:cursor-not-allowed"
        />
        {query && (
          <button
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-theme-bg-tertiary text-theme-text-muted hover:text-theme-text-primary transition-colors"
            aria-label="Clear search"
          >
            <CloseIcon className="w-4 h-4" />
          </button>
        )}
      </div>

      {showDropdown && (
        <div className="absolute z-50 right-0 sm:left-0 mt-1 w-80 max-w-[calc(100vw-2rem)] bg-theme-bg-secondary border border-theme-border rounded-lg shadow-xl overflow-hidden">
          {isSearching && (
            <div className="px-4 py-3 text-sm text-theme-text-muted flex items-center gap-2">
              <Spinner size="sm" />
              Searching...
            </div>
          )}

          {!isSearching && results.length === 0 && (
            <div className="px-4 py-3 text-sm text-theme-text-muted">
              No results for &ldquo;{debouncedQuery}&rdquo;
            </div>
          )}

          {!isSearching && results.length > 0 && (
            <ul className="max-h-64 overflow-y-auto">
              {results.map((result) => (
                <li key={result.id}>
                  <button
                    onClick={() => handleSelect(result)}
                    className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-theme-bg-tertiary transition-colors text-left"
                  >
                    {isSafeImageUrl(result.profileImageUrl) ? (
                      <img
                        src={result.profileImageUrl}
                        alt=""
                        className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-theme-bg-tertiary flex items-center justify-center flex-shrink-0">
                        <UserIcon className="w-4 h-4 text-theme-text-muted" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-theme-text-primary truncate">{result.primaryLabel}</div>
                      {result.secondaryLabel && result.secondaryLabel !== result.primaryLabel && (
                        <div className="text-sm text-theme-text-muted truncate">{result.secondaryLabel}</div>
                      )}
                    </div>
                    {result.rank != null && (
                      <div className="text-sm text-pd3 font-medium flex-shrink-0">
                        #{result.rank}
                      </div>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
