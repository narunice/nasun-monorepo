import { useState, useRef, useEffect, useCallback } from "react";
import { Search, X, User } from "lucide-react";
import { Spinner } from "./Spinner";

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

export function LeaderboardSearchBox<T>({
  entries,
  filterFn,
  toResult,
  onSelect,
  placeholder = "Search by handle, name, or address...",
  disabled = false,
}: LeaderboardSearchBoxProps<T>) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Debounce 300ms
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const results: LeaderboardSearchResult[] = debouncedQuery.length >= 2
    ? entries
        .filter((e) => filterFn(e, debouncedQuery.toLowerCase()))
        .slice(0, 8)
        .map(toResult)
    : [];

  // Click-outside close
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
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
    setQuery("");
    setDebouncedQuery("");
    setIsOpen(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && results.length > 0) {
      handleSelect(results[0]);
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  const showDropdown = isOpen && debouncedQuery.length >= 2;
  const isSearching = debouncedQuery !== query;

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-nasun-white/60" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => query.length >= 2 && setIsOpen(true)}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full bg-black/60 border border-nasun-c4/50 rounded-sm pl-10 pr-8 py-2 text-sm text-nasun-white placeholder-nasun-white/60 focus:outline-none focus:border-nasun-c7/50 disabled:opacity-50 disabled:cursor-not-allowed"
        />
        {query && (
          <button
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-nasun-c5/30 text-nasun-white/40 hover:text-nasun-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {showDropdown && (
        <div className="absolute z-50 w-full mt-1 bg-nasun-c6 border border-nasun-c4/50 rounded-sm shadow-xl overflow-hidden">
          {isSearching && (
            <div className="px-4 py-3 text-sm text-nasun-white/50 flex items-center gap-2">
              <Spinner size="sm" />
              Searching...
            </div>
          )}

          {!isSearching && results.length === 0 && (
            <div className="px-4 py-3 text-sm text-nasun-white/50">No results found</div>
          )}

          {!isSearching && results.length > 0 && (
            <ul className="max-h-64 overflow-y-auto">
              {results.map((result) => (
                <li key={result.id}>
                  <button
                    onClick={() => handleSelect(result)}
                    className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-nasun-c5/30 transition-colors text-left"
                  >
                    {result.profileImageUrl ? (
                      <img
                        src={result.profileImageUrl}
                        alt=""
                        className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = "none";
                        }}
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-nasun-c5/30 flex items-center justify-center flex-shrink-0">
                        <User className="w-4 h-4 text-nasun-white/50" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-nasun-white truncate">{result.primaryLabel}</div>
                      {result.secondaryLabel && (
                        <div className="text-xs text-nasun-white/50 truncate">{result.secondaryLabel}</div>
                      )}
                    </div>
                    {result.rank != null && (
                      <div className="text-xs text-nasun-c7 font-medium flex-shrink-0">
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
