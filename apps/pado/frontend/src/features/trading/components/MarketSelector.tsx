/**
 * MarketSelector Component
 * 거래쌍(마켓) 선택 드롭다운
 */

import { useState, useRef, useEffect } from 'react';
import { useMarket, type MarketKey } from '../context/MarketContext';

export function MarketSelector() {
  const { currentMarket, setMarket, markets, getMarketLabel } = useMarket();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  const handleSelect = (key: MarketKey) => {
    setMarket(key);
    setIsOpen(false);
  };

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
            <div className="text-xs xl:text-sm text-theme-text-muted px-3 py-1 mb-1">Select Market</div>
            {markets.map(market => (
              <button
                key={market.key}
                onClick={() => handleSelect(market.key)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                  market.key === currentMarket
                    ? 'bg-blue-600/20 text-blue-600 dark:text-blue-400'
                    : 'hover:bg-theme-bg-tertiary text-theme-text-primary'
                }`}
              >
                {/* 토큰 아이콘 */}
                <div className="flex -space-x-2">
                  <TokenIcon symbol={market.pool.baseToken.symbol} />
                  <TokenIcon symbol={market.pool.quoteToken.symbol} />
                </div>

                {/* 마켓 정보 */}
                <div className="flex-1 text-left">
                  <div className="font-medium">{market.label}</div>
                  <div className="text-xs xl:text-sm text-theme-text-muted">
                    {market.pool.baseToken.name} / {market.pool.quoteToken.name}
                  </div>
                </div>

                {/* 선택 표시 */}
                {market.key === currentMarket && (
                  <svg className="w-4 h-4 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
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
function TokenIcon({ symbol }: { symbol: string }) {
  // 토큰별 배경색
  const bgColors: Record<string, string> = {
    NBTC: 'bg-orange-500',
    NUSDC: 'bg-blue-500',
    NASUN: 'bg-purple-500',
  };

  return (
    <div
      className={`w-6 h-6 rounded-full ${bgColors[symbol] ?? 'bg-theme-bg-tertiary'} flex items-center justify-center text-xs xl:text-sm font-bold text-white border-2 border-theme-bg-primary`}
    >
      {symbol.charAt(0)}
    </div>
  );
}
