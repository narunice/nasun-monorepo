/**
 * MobileTradeLayout Component
 * Tab-based layout for mobile trading: Chart | Book | Trade
 * Replaces the stacked vertical layout for better mobile UX
 */

import { useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { useOrderForm } from '../context';
import { MobileBottomBar } from './MobileBottomBar';
import { MobileMiniTicker } from './MobileMiniTicker';

type MobileTab = 'chart' | 'book' | 'trade';

interface MiniTickerData {
  symbol: string;
  price: number;
  priceChange24h?: number;
}

interface MobileTradeLayoutProps {
  chartContent: ReactNode;
  bookContent: ReactNode;
  tradeContent: ReactNode;
  bottomTabContent?: ReactNode;
  miniTicker?: MiniTickerData;
}

const TAB_LABELS: Record<MobileTab, string> = {
  chart: 'Chart',
  book: 'Book',
  trade: 'Trade',
};

export function MobileTradeLayout({
  chartContent,
  bookContent,
  tradeContent,
  bottomTabContent,
  miniTicker,
}: MobileTradeLayoutProps) {
  const [activeTab, setActiveTab] = useState<MobileTab>('chart');
  const { setSide } = useOrderForm();

  const handleTradeClick = useCallback((side: 'buy' | 'sell') => {
    setSide(side);
    setActiveTab('trade');
  }, [setSide]);

  return (
    <div className="lg:hidden flex flex-col" style={{ minHeight: 'calc(100vh - 52px)' }}>
      {/* Mini Ticker — persistent price context across tabs */}
      {miniTicker && (
        <MobileMiniTicker
          symbol={miniTicker.symbol}
          price={miniTicker.price}
          priceChange24h={miniTicker.priceChange24h}
        />
      )}

      {/* Tab Bar */}
      <div className="flex border-b border-theme-border bg-theme-bg-secondary">
        {(['chart', 'book', 'trade'] as MobileTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab
                ? 'text-theme-text-primary border-b-2 border-theme-accent'
                : 'text-theme-text-muted hover:text-theme-text-secondary'
            }`}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 pb-16">
        {activeTab === 'chart' && (
          <div className="space-y-3 p-3">
            <div style={{ height: 'calc(100vh - 200px)', minHeight: '300px' }}>
              {chartContent}
            </div>
            {bottomTabContent}
          </div>
        )}

        {activeTab === 'book' && (
          <div className="p-3" style={{ height: 'calc(100vh - 160px)' }}>
            <div className="bg-theme-bg-secondary rounded-lg p-3 h-full">
              {bookContent}
            </div>
          </div>
        )}

        {activeTab === 'trade' && (
          <div className="p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 160px)' }}>
            {tradeContent}
          </div>
        )}
      </div>

      {/* Fixed Bottom Bar (only show on chart/book tabs) */}
      {activeTab !== 'trade' && (
        <MobileBottomBar onTradeClick={handleTradeClick} />
      )}
    </div>
  );
}
