/**
 * 🆕 Phase 1: UserSearchBox Component
 *
 * @description
 * 사용자 검색 기능을 제공하는 컴포넌트입니다.
 * 하이브리드 검색(정확 일치 + 부분 일치)을 지원합니다.
 *
 * @author Claude Code
 * @date 2025-10-23
 */

import React, { memo, useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useUserSearch } from "../hooks";
import { CumulativePeriod } from "../types";
import { Button } from "../../../ui/button";

interface UserSearchBoxProps {
  period: CumulativePeriod;
  date?: string;
  onUserSelect?: (username: string, rank: number) => void;
}

/**
 * 사용자 검색 박스
 */
export const UserSearchBox: React.FC<UserSearchBoxProps> = memo(
  ({ period, date, onUserSelect }) => {
    const { t } = useTranslation("leaderboard");
    const { results, isSearching, error, setQuery, search, clear } = useUserSearch({
      period,
      date,
    });

    const [inputValue, setInputValue] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);
    const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

    // 🆕 탭 전환 또는 날짜 변경 시 검색 입력값 초기화
    useEffect(() => {
      console.log("🔄 [UserSearchBox] Period/Date 변경 감지 - 검색 초기화", { period, date });
      setInputValue("");
      clear();
      // Debounce 타이머도 정리
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [period, date]);

    // 🧹 Cleanup: 컴포넌트 unmount 시 타이머 정리
    useEffect(() => {
      return () => {
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
        }
      };
    }, []);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;

      // 즉시 입력값 표시 (재렌더링 없음, 커서 유지)
      setInputValue(value);

      // 기존 타이머 취소
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      // 500ms 후 검색 실행 (Debounce)
      debounceTimerRef.current = setTimeout(() => {
        setQuery(value); // 🎯 이때 React Query가 활성화됨
      }, 500);
    };

    const handleSearch = () => {
      if (inputValue.trim()) {
        search(inputValue);
      }
    };

    const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        handleSearch();
      }
    };

    const handleClear = () => {
      setInputValue("");
      clear();
    };

    const handleUserClick = (username: string, rank: number) => {
      onUserSelect?.(username, rank);
    };

    return (
      <div className="space-y-4">
        {/* 검색 입력 */}
        <div className="relative">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyPress}
              placeholder={t("search.placeholder")}
              className="flex-1 px-4 py-1 border border-nasun-c3/50 rounded-lg bg-nasun-black text-nasun-white placeholder-nasun-black/40 dark:placeholder-nasun-white/40 focus:outline-none focus:ring-2 focus:ring-nasun-c3"
              disabled={isSearching}
            />
            <Button
              onClick={handleSearch}
              disabled={isSearching || !inputValue.trim()}
              variant="filledOutlineC3"
              size="sm"
              className="px-6"
            >
              {isSearching ? "..." : t("search.searchButton")}
            </Button>
            {(inputValue || results) && (
              <Button onClick={handleClear} variant="outlineC3" size="sm" className="px-4">
                {t("search.clearButton")}
              </Button>
            )}
          </div>
        </div>

        {/* 에러 메시지 */}
        {error && (
          <div className="p-3 bg-red-900 border border-red-700 rounded-lg">
            <p className="text-red-300">{t("search.errors.searchFailed", { error })}</p>
          </div>
        )}

        {/* 검색 결과 */}
        {results && (
          <div className="space-y-3 bg-gray-800/80 rounded-lg p-4">
            {/* 정확 일치 */}
            {results.exactMatch && (
              <div className="bg-nasun-c3/5 border-2 border-nasun-c3 rounded-lg p-4">
                <SearchResultItem
                  match={results.exactMatch}
                  onClick={handleUserClick}
                  isExactMatch={true}
                />
              </div>
            )}

            {/* 부분 일치 */}
            {results.matches.length > (results.exactMatch ? 1 : 0) && (
              <div className="space-y-2">
                <div className="font-semibold text-nasun-white/80">
                  {t("search.partialMatches", {
                    count: results.matches.length - (results.exactMatch ? 1 : 0),
                  })}
                </div>
                <div className="space-y-2">
                  {results.matches
                    .filter((match) => match.username !== results.exactMatch?.username)
                    .map((match) => (
                      <div key={match.username} className="bg-nasun-c2/10 rounded-lg p-3">
                        <SearchResultItem
                          match={match}
                          onClick={handleUserClick}
                          isExactMatch={false}
                        />
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* 결과 없음 */}
            {results.total === 0 && (
              <div className="text-center py-6 text-nasun-white/60">{t("search.noResults")}</div>
            )}
          </div>
        )}
      </div>
    );
  }
);

UserSearchBox.displayName = "UserSearchBox";

/**
 * 검색 결과 아이템
 */
interface SearchResultItemProps {
  match: {
    username: string;
    rank: number;
    totalScore?: number;
    finalScore?: number; // <-- 추가: finalScore가 옵셔널일 수 있음
    displayName?: string;
    profileImageUrl?: string;
  };
  onClick: (username: string, rank: number) => void;
  isExactMatch: boolean;
}

const SearchResultItem: React.FC<SearchResultItemProps> = memo(
  ({ match, onClick, isExactMatch }) => {
    // hover 효과 클래스 결정
    const hoverClass = isExactMatch ? "hover:bg-nasun-c3/20" : "hover:bg-nasun-c2/40";

    return (
      <div
        onClick={() => onClick(match.username, match.rank)}
        className={`flex items-center gap-3 cursor-pointer ${hoverClass} rounded-lg p-2 -m-2`}
      >
        {match.profileImageUrl && (
          <img
            src={match.profileImageUrl}
            alt={match.displayName || match.username}
            className="w-10 h-10 rounded-xl flex-shrink-0"
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="font-medium text-nasun-white truncate">
            {match.displayName || match.username}
          </div>
          <div className="text-nasun-white/60 truncate">@{match.username}</div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="font-bold text-nasun-c2">#{match.rank}</div>
          <div className="text-nasun-white/60">
            {(match.finalScore ?? match.totalScore ?? 0).toFixed(2)} pts
          </div>
        </div>
      </div>
    );
  }
);

SearchResultItem.displayName = "SearchResultItem";
