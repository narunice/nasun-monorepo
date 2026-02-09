/**
 * MarketSelector Component
 * 거래쌍(마켓) 선택 드롭다운
 */

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useMarket, type MarketKey } from '../context/MarketContext';
import { useFavoriteMarkets } from '../hooks/useFavoriteMarkets';

export function MarketSelector() {
  const { currentMarket, setMarket, markets, getMarketLabel } = useMarket();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const { favorites, toggleFavorite } = useFavoriteMarkets();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const handleToggleFavorite = useCallback((key: string, e: React.MouseEvent) => {
    e.stopPropagation();
    toggleFavorite(key);
  }, [toggleFavorite]);

  // 외부 클릭 시 드롭다운 닫기
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Reset search and auto-focus when dropdown opens
  useEffect(() => {
    if (isOpen) {
      setSearch('');
      setTimeout(() => searchRef.current?.focus(), 0);
    }
  }, [isOpen]);

  const handleSelect = (key: MarketKey) => {
    setMarket(key);
    setIsOpen(false);
  };

  // Filter and sort markets (favorites first)
  const filteredMarkets = useMemo(() => {
    const filtered = markets.filter((m) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return m.label.toLowerCase().includes(q)
        || m.pool.baseToken.name.toLowerCase().includes(q)
        || m.pool.baseToken.symbol.toLowerCase().includes(q);
    });
    return [...filtered].sort((a, b) => {
      const aFav = favorites.includes(a.key) ? 0 : 1;
      const bFav = favorites.includes(b.key) ? 0 : 1;
      return aFav - bFav;
    });
  }, [markets, search, favorites]);

  const currentMarketData = markets.find(m => m.key === currentMarket);

  return (
    <div className="relative" ref={dropdownRef}>
      {/* 선택 버튼 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 bg-theme-bg-tertiary hover:bg-theme-bg-secondary rounded-lg transition-colors"
      >
        {/* 토큰 아이콘 */}
        <div className="flex -space-x-2">
          <TokenIcon symbol={currentMarketData?.pool.baseToken.symbol ?? ''} />
          <TokenIcon symbol={currentMarketData?.pool.quoteToken.symbol ?? ''} />
        </div>

        {/* 마켓 라벨 */}
        <span className="font-semibold text-theme-text-primary">{getMarketLabel()}</span>

        {/* 드롭다운 화살표 */}
        <svg
          className={`w-4 h-4 text-theme-text-secondary transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* 드롭다운 메뉴 */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-64 bg-theme-bg-secondary border border-theme-border rounded-lg shadow-xl z-50">
          <div className="p-2">
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search markets..."
              className="w-full px-3 py-1.5 mb-2 text-sm bg-theme-bg-tertiary border border-theme-border rounded-md text-theme-text-primary placeholder:text-theme-text-muted focus:outline-none focus:ring-1 focus:ring-pd1"
            />
            {filteredMarkets.length === 0 && (
              <div className="px-3 py-4 text-sm text-theme-text-muted text-center">No markets found</div>
            )}
            {filteredMarkets.map(market => (
              <button
                key={market.key}
                onClick={() => handleSelect(market.key)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                  market.key === currentMarket
                    ? 'bg-pd1/20 text-pd1 dark:text-pd3'
                    : 'hover:bg-theme-bg-tertiary text-theme-text-primary'
                }`}
              >
                {/* Favorite star */}
                <span
                  onClick={(e) => handleToggleFavorite(market.key, e)}
                  aria-label={favorites.includes(market.key) ? `Remove ${market.label} from favorites` : `Add ${market.label} to favorites`}
                  className={`text-sm transition-colors select-none ${
                    favorites.includes(market.key) ? 'text-yellow-400' : 'text-theme-text-muted/30 hover:text-yellow-400/60'
                  }`}
                >
                  {favorites.includes(market.key) ? '\u2605' : '\u2606'}
                </span>

                {/* Token icons */}
                <div className="flex -space-x-2">
                  <TokenIcon symbol={market.pool.baseToken.symbol} />
                  <TokenIcon symbol={market.pool.quoteToken.symbol} />
                </div>

                {/* Market info */}
                <div className="flex-1 text-left">
                  <div className="font-medium">{market.label}</div>
                  <div className="text-xs xl:text-sm text-theme-text-muted">
                    {market.pool.baseToken.name} / {market.pool.quoteToken.name}
                  </div>
                </div>

                {/* Selected checkmark */}
                {market.key === currentMarket && (
                  <svg className="w-4 h-4 text-pd3" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// 토큰 아이콘 컴포넌트
export function TokenIcon({ symbol }: { symbol: string }) {
  // 토큰별 배경색
  const bgColors: Record<string, string> = {
    NBTC: 'bg-orange-500',
    NUSDC: 'bg-pd2',
    NASUN: 'bg-purple-500',
    NETH: 'bg-blue-500',
    NSOL: 'bg-emerald-500',
  };

  return (
    <div
      className={`w-6 h-6 rounded-full ${bgColors[symbol] ?? 'bg-theme-bg-tertiary'} flex items-center justify-center text-xs xl:text-sm font-bold text-white border-2 border-theme-bg-primary`}
    >
      {symbol.charAt(0)}
    </div>
  );
}
