/**
 * UserSearchBoxV3 Component
 *
 * Search box with autocomplete for finding users in the leaderboard.
 * V2 UserSearchBox pattern.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { Search, X, User } from "lucide-react";
import { useUserSearchV3 } from "../hooks/useUserSearchV3";
import type { SearchAccountResult } from "../services/leaderboardV3Api";

interface UserSearchBoxV3Props {
  seasonId?: string;
  onUserSelect: (username: string, rank?: number) => void;
  placeholder?: string;
}

export function UserSearchBoxV3({
  seasonId,
  onUserSelect,
  placeholder = "Search user...",
}: UserSearchBoxV3Props) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Debounce query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Search with debounced query
  const { data, isLoading } = useUserSearchV3({
    query: debouncedQuery,
    seasonId,
    limit: 8,
    enabled: debouncedQuery.length >= 2,
  });

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
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
    (account: SearchAccountResult) => {
      setQuery(account.username);
      setIsOpen(false);
      onUserSelect(account.username, account.rank);
    },
    [onUserSelect],
  );

  const handleClear = () => {
    setQuery("");
    setDebouncedQuery("");
    setIsOpen(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && data?.accounts && data.accounts.length > 0) {
      handleSelect(data.accounts[0]);
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  const showDropdown = isOpen && debouncedQuery.length >= 2;

  return (
    <div ref={containerRef} className="relative w-full max-w-sm pl-1">
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-nasun-white/40" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => query.length >= 2 && setIsOpen(true)}
          placeholder={placeholder}
          className="w-full bg-black/60 border border-nasun-c4/50 rounded-sm pl-10 pr-8 py-2 text-sm text-nasun-white placeholder-nasun-white/40 focus:outline-none focus:border-nasun-c7/50"
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

      {/* Dropdown */}
      {showDropdown && (
        <div className="absolute z-50 w-full mt-1 bg-nasun-c6 border border-nasun-c4/50 rounded-sm shadow-xl overflow-hidden">
          {isLoading && (
            <div className="px-4 py-3 text-sm text-nasun-white/50 flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-nasun-c7/30 border-t-nasun-c7 rounded-full animate-spin" />
              Searching...
            </div>
          )}

          {!isLoading && data?.accounts && data.accounts.length === 0 && (
            <div className="px-4 py-3 text-sm text-nasun-white/50">No users found</div>
          )}

          {!isLoading && data?.accounts && data.accounts.length > 0 && (
            <ul className="max-h-64 overflow-y-auto">
              {data.accounts.map((account) => (
                <li key={account.accountId}>
                  <button
                    onClick={() => handleSelect(account)}
                    className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-nasun-c5/30 transition-colors text-left"
                  >
                    {/* Avatar */}
                    {account.profileImageUrl ? (
                      <img
                        src={account.profileImageUrl}
                        alt={account.originalUsername || account.username}
                        className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-nasun-c5/30 flex items-center justify-center flex-shrink-0">
                        <User className="w-4 h-4 text-nasun-white/50" />
                      </div>
                    )}

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-nasun-white truncate">
                        @{account.originalUsername || account.username}
                      </div>
                      {account.displayName && (
                        <div className="text-xs text-nasun-white/50 truncate">
                          {account.displayName}
                        </div>
                      )}
                    </div>

                    {/* Rank */}
                    {account.rank && (
                      <div className="text-xs text-nasun-c7 font-medium flex-shrink-0">
                        #{account.rank}
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
