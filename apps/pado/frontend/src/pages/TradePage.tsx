/**
 * TradePage
 * DEX Trading Page - Full width layout for professional trading
 * Pro mode: Chart+BottomTab | Orderbook+Chat | OrderForm+News (3 columns)
 * Simple mode: Chart | OrderForm | Chat (3 columns)
 *
 * Right-side cards share fixed width (CARD_W).
 * Header toggle bars (Interface, TradingToggles) also use CARD_W
 * and are right-aligned to match the rightmost card.
 */

import { useQuery } from "@tanstack/react-query";
import { useAdaptiveInterval } from "../hooks/useAdaptiveInterval";
import { OrderFormProvider, MarketProvider, useMarket } from "../features/trading/context";
import { TradingPanel, EnablePadoCard } from "../features/trading/containers";
import {
  MarketSelector,
  BottomTabPanel,
  MarketInfoBar,
  PriceChart,
  DepthChart,
  Orderbook,
  TradingToggles,
  PoolInfo,
  ShortcutHelpTooltip,
  KeyboardShortcutsPanel,
  MobileTradeLayoutV2,
  OnboardingTour,
  FavoriteStrip,
  FirstTradeCelebration,
} from "../features/trading/components";
import {
  useTradeMode,
  useOrderbook,
  useKeyboardShortcuts,
  useOnboardingTour,
  isTourCompleted,
  useFirstTradeCelebration,
} from "../features/trading/hooks";
import { useOrderForm } from "../features/trading/context";
import { usePrices } from "../features/core/usePrices";
import { type TokenSymbol, set24hChange } from "../lib/prices";
import type { PriceLevel } from "../lib/deepbook";
import { fetchBinance24hTicker, getBinanceSymbol } from "../lib/indicators";
import { useState, useEffect, useCallback } from "react";
import { ChatPanel, MobileChatDrawer, useChatPanel, FloatingChatPopup } from "../features/social";
import { NewsCarousel } from "../features/news";

// Fixed height for chart and orderbook to ensure consistent layout
// 750px: room for 4+ sub-indicators in chart, TP/SL in order form without scroll
const CHART_HEIGHT = 770;
// Chat panel height when expanded (below chart area)
const CHAT_HEIGHT = 360;

// Per-card width — shared by each right-side card and header toggles
const CARD_W = "w-[300px] 2xl:w-[340px]";

// Simple mode max width: Chart + 2 cards + gaps, centered
// Wider layout for more chart space: ~780px chart + 2*300px cards + 2*12px gaps ≈ 1404px
const SIMPLE_MAX_W = "xl:max-w-[1400px] 2xl:max-w-[1520px] xl:mx-auto";

type ChartView = "price" | "depth";

interface ChartAreaProps {
  chartView: ChartView;
  onChartViewChange: (view: ChartView) => void;
  currentPrice: number;
  bids: PriceLevel[];
  asks: PriceLevel[];
  midPrice: number;
}

function ChartArea({
  chartView,
  onChartViewChange,
  currentPrice,
  bids,
  asks,
  midPrice,
}: ChartAreaProps) {
  return (
    <div className="flex flex-col h-full bg-theme-bg-secondary rounded-lg overflow-hidden">
      <div className="shrink-0 flex items-center gap-1 px-3 py-1.5">
        <button
          onClick={() => onChartViewChange("price")}
          className={`px-2 py-0.5 text-xs font-medium rounded transition-colors ${
            chartView === "price"
              ? "text-theme-text-primary bg-theme-bg-tertiary"
              : "text-theme-text-muted hover:text-theme-text-secondary"
          }`}
        >
          Price
        </button>
        <button
          onClick={() => onChartViewChange("depth")}
          className={`px-2 py-0.5 text-xs font-medium rounded transition-colors ${
            chartView === "depth"
              ? "text-theme-text-primary bg-theme-bg-tertiary"
              : "text-theme-text-muted hover:text-theme-text-secondary"
          }`}
        >
          Depth
        </button>
      </div>
      <div className="flex-1 min-h-0">
        {chartView === "price" ? (
          <PriceChart currentPrice={currentPrice} />
        ) : (
          <DepthChart bids={bids} asks={asks} midPrice={midPrice} />
        )}
      </div>
    </div>
  );
}

function NewsCollapsedBar({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full bg-theme-bg-secondary rounded-lg px-3 py-2
        flex items-center justify-between
        border border-theme-border
        text-theme-text-muted hover:text-theme-text-primary transition-colors"
    >
      <div className="flex items-center gap-2">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M19 20H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1m2 13a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2z" />
        </svg>
        <span className="text-trading-sm font-medium">News</span>
      </div>
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
    </button>
  );
}

function ChatCollapsedBar({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full bg-theme-bg-secondary rounded-lg px-3 py-2
        flex items-center justify-between
        border border-theme-border
        text-theme-text-muted hover:text-theme-text-primary transition-colors"
    >
      <div className="flex items-center gap-2">
        <div className="relative">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          {/* Activity dot */}
          <span className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full animate-pulse" />
        </div>
        <span className="text-trading-sm font-medium">Chat</span>
        <span className="text-[10px] text-theme-text-muted opacity-70">Live</span>
      </div>
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
    </button>
  );
}

function TradePageContent() {
  const { mode, toggleMode, isSimple } = useTradeMode();
  const [shortcutsPanelOpen, setShortcutsPanelOpen] = useState(false);
  const toggleShortcutsPanel = useCallback(() => setShortcutsPanelOpen(prev => !prev), []);
  useKeyboardShortcuts(!isSimple, { onToggleShortcutsPanel: toggleShortcutsPanel }); // Pro mode only
  const { isVisible: chatVisible, toggle: toggleChat } = useChatPanel();
  const [chatFloating, setChatFloating] = useState(false);
  const [newsVisible, setNewsVisible] = useState(true);
  const [chartView, setChartView] = useState<ChartView>("price");
  const tour = useOnboardingTour();
  const { showCelebration, dismiss: dismissCelebration } = useFirstTradeCelebration();

  // Auto-start tour on first visit (xl+ viewport, not completed)
  useEffect(() => {
    if (!isTourCompleted() && window.innerWidth >= 1280) {
      const timer = setTimeout(() => tour.start(), 1500);
      return () => clearTimeout(timer);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- run once on mount
  const { currentPool } = useMarket();
  const { data: orderbookData, isError: isOrderbookError } = useOrderbook();
  const { setPrice, setStopPrice, focusedPriceField } = useOrderForm();
  const { getPrice, getPriceInfo } = usePrices();

  const orderbook = orderbookData?.orderbook ?? { bids: [], asks: [], spread: 0, midPrice: 0 };
  const midPrice = orderbookData?.midPrice ?? 0;

  // Price priority: DeepBook midPrice > oracle/simulated price
  const baseSymbol = currentPool.baseToken.symbol as TokenSymbol;
  const oraclePrice = getPrice(baseSymbol);
  const displayPrice = midPrice || oraclePrice;

  // Fetch real 24h market data from Binance
  const binanceSymbol = getBinanceSymbol(baseSymbol);
  const adaptiveInterval = useAdaptiveInterval(30_000);
  const { data: ticker24h } = useQuery({
    queryKey: ["ticker24h", binanceSymbol],
    queryFn: () => fetchBinance24hTicker(binanceSymbol),
    enabled: !!binanceSymbol,
    refetchInterval: adaptiveInterval,
    staleTime: 15_000,
  });

  // Push real 24h change into unified price cache
  useEffect(() => {
    if (ticker24h?.priceChangePercent != null) {
      set24hChange(baseSymbol, ticker24h.priceChangePercent);
    }
  }, [baseSymbol, ticker24h?.priceChangePercent]);

  // Market info data (undefined when no Binance data, shows "--" in bar)
  const marketInfo = {
    symbol: `${currentPool.baseToken.symbol}/${currentPool.quoteToken.symbol}`,
    price: displayPrice,
    priceChange24h: ticker24h?.priceChangePercent,
    volume24h: ticker24h?.quoteVolume,
    high24h: ticker24h?.highPrice,
    low24h: ticker24h?.lowPrice,
    priceSource: midPrice ? 'oracle' as const : getPriceInfo(baseSymbol).source,
  };

  // Handle orderbook price click — route to focused field in stop-limit mode
  const handlePriceClick = (price: number) => {
    const formatted = price.toFixed(2);
    if (focusedPriceField === 'stopPrice') {
      setStopPrice(formatted);
    } else {
      setPrice(formatted);
    }
  };

  return (
    <div className="space-y-3">
      {/* Header: MarketSelector+InfoBar | Interface+Toggles (Col2) | PoolInfo box (Col3, Pro only) */}
      <div className={`flex gap-3 ${isSimple ? SIMPLE_MAX_W : ""}`}>
        {/* Col 1: MarketSelector + FavoriteStrip + MarketInfoBar stacked */}
        <div className="flex-1 min-w-0 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <MarketSelector />
            <FavoriteStrip />
          </div>
          <div className="flex items-stretch gap-3">
            <div className="flex-1 min-w-0">
              <MarketInfoBar {...marketInfo} />
            </div>
            {/* Simple mode xl+: Interface toggle inline with market info */}
            {isSimple && (
              <div className={`hidden xl:flex shrink-0 items-center justify-between bg-theme-bg-secondary rounded-lg px-3 ${CARD_W}`}>
                <span className="text-xs text-theme-text-muted whitespace-nowrap">Interface</span>
                <div className="flex items-center gap-2">
                  <span className="text-trading-sm text-theme-text-primary font-medium">Simple</span>
                  <button
                    onClick={toggleMode}
                    className="w-7 h-3.5 rounded-full transition-colors bg-theme-toggle-off"
                    aria-label="Switch to Pro mode"
                  >
                    <span className="block w-3 h-3 rounded-full bg-white transition-transform translate-x-0.5" />
                  </button>
                  <span className="text-trading-sm text-theme-text-muted">Pro</span>
                </div>
              </div>
            )}
          </div>
        </div>
        {/* Col 2: Interface toggle + TradingToggles stacked (Pro only in header row) */}
        {!isSimple && (
          <div className={`hidden xl:block shrink-0 ${CARD_W}`}>
            <div className="flex flex-col gap-3">
              <div data-tour="mode-toggle" className="bg-theme-bg-secondary rounded-lg px-3 py-3 flex items-center justify-between">
                <span className="text-xs text-theme-text-muted whitespace-nowrap">Interface</span>
                <div className="flex items-center gap-2">
                  <span className="text-trading-sm text-theme-text-muted">Simple</span>
                  <button
                    onClick={toggleMode}
                    className="w-7 h-3.5 rounded-full transition-colors bg-purple-500"
                    aria-label="Switch to Simple mode"
                  >
                    <span className="block w-3 h-3 rounded-full bg-white transition-transform translate-x-3.5" />
                  </button>
                  <span className="text-trading-sm text-theme-text-primary font-medium">Pro</span>
                </div>
              </div>
              <TradingToggles />
            </div>
          </div>
        )}
        {/* Col 3: PoolInfo box (Pro only, full height matching Col 2) */}
        {!isSimple && (
          <div className={`hidden xl:block shrink-0 ${CARD_W}`}>
            <PoolInfo variant="header" />
          </div>
        )}
      </div>

      {/* Mobile-only: Interface toggle (visible below xl) */}
      <div className="xl:hidden">
        <div className="bg-theme-bg-secondary rounded-lg px-3 py-3 flex items-center justify-between">
          <span className="text-xs text-theme-text-muted">Interface</span>
          <div className="flex items-center gap-2">
            <span
              className={`text-trading-sm ${isSimple ? "text-theme-text-primary font-medium" : "text-theme-text-muted"}`}
            >
              Simple
            </span>
            <button
              onClick={toggleMode}
              className={`w-7 h-3.5 rounded-full transition-colors ${
                isSimple ? "bg-theme-toggle-off" : "bg-purple-500"
              }`}
              aria-label={`Switch to ${isSimple ? "Pro" : "Simple"} mode`}
            >
              <span
                className={`block w-3 h-3 rounded-full bg-white transition-transform ${
                  isSimple ? "translate-x-0.5" : "translate-x-3.5"
                }`}
              />
            </button>
            <span
              className={`text-trading-sm ${!isSimple ? "text-theme-text-primary font-medium" : "text-theme-text-muted"}`}
            >
              Pro
            </span>
          </div>
        </div>
        {!isSimple && (
          <div className="mt-3">
            <TradingToggles />
          </div>
        )}
      </div>

      {/* Main Trading Area (xl+): Chart + cards side by side */}
      {isSimple ? (
        /* Simple mode: Chart | OrderForm | Chat — 3 columns, centered */
        <div className={`hidden xl:flex gap-3 ${SIMPLE_MAX_W}`}>
          {/* Col 1: Chart (flexible, fills remaining space) */}
          <div data-tour="chart" className="flex-1 min-w-0" style={{ height: `${CHART_HEIGHT}px` }}>
            <ChartArea
              chartView={chartView}
              onChartViewChange={setChartView}
              currentPrice={displayPrice}
              bids={orderbook.bids}
              asks={orderbook.asks}
              midPrice={midPrice}
            />
          </div>
          {/* Col 2: Quick Trade */}
          <div data-tour="orderform" className={`shrink-0 ${CARD_W}`} style={{ height: `${CHART_HEIGHT}px` }}>
            <TradingPanel mode={mode} />
          </div>
          {/* Col 3: Chat (same height as Quick Trade) */}
          <div data-tour="chat" className={`shrink-0 ${CARD_W}`}>
            {!chatFloating &&
              (chatVisible ? (
                <div style={{ height: `${CHART_HEIGHT}px` }}>
                  <ChatPanel onMinimize={toggleChat} onPopOut={() => setChatFloating(true)} />
                </div>
              ) : (
                <ChatCollapsedBar onClick={toggleChat} />
              ))}
          </div>
        </div>
      ) : (
        /* Pro mode: Chart+BottomTab | Orderbook+Chat | OrderForm+News — 3 columns */
        <div className="hidden xl:flex gap-3">
          {/* Col 1 (flex): Chart + BottomTab */}
          <div className="flex-1 min-w-0 flex flex-col gap-3">
            <div data-tour="chart" style={{ height: `${CHART_HEIGHT}px` }}>
              <ChartArea
                chartView={chartView}
                onChartViewChange={setChartView}
                currentPrice={displayPrice}
                bids={orderbook.bids}
                asks={orderbook.asks}
                midPrice={midPrice}
              />
            </div>
            <div style={{ height: `${CHAT_HEIGHT}px` }}>
              <BottomTabPanel className="h-full" />
            </div>
          </div>
          {/* Col 2 (CARD_W): Orderbook + Chat */}
          <div className={`shrink-0 ${CARD_W} flex flex-col gap-3`}>
            <div
              data-tour="orderbook"
              className="bg-theme-bg-secondary rounded-lg p-3 overflow-hidden"
              style={{ height: `${CHART_HEIGHT}px` }}
            >
              <Orderbook orderbook={orderbook} onPriceClick={handlePriceClick} compact isError={isOrderbookError} />
            </div>
            {!chatFloating &&
              (chatVisible ? (
                <div data-tour="chat" style={{ height: `${CHAT_HEIGHT}px` }}>
                  <ChatPanel onMinimize={toggleChat} onPopOut={() => setChatFloating(true)} />
                </div>
              ) : (
                <ChatCollapsedBar onClick={toggleChat} />
              ))}
          </div>
          {/* Col 3 (CARD_W): EnablePado + OrderForm + News + Shortcut Help */}
          <div className={`shrink-0 ${CARD_W} flex flex-col gap-3`}>
            <EnablePadoCard />
            <div data-tour="orderform" style={{ minHeight: `${CHART_HEIGHT}px` }}>
              <TradingPanel mode={mode} />
            </div>
            {newsVisible ? (
              <div className="relative" style={{ height: `${CHAT_HEIGHT}px` }}>
                <NewsCarousel onMinimize={() => setNewsVisible(false)} />
                <div className="absolute bottom-2 right-2">
                  <ShortcutHelpTooltip onClick={toggleShortcutsPanel} />
                </div>
              </div>
            ) : (
              <NewsCollapsedBar onClick={() => setNewsVisible(true)} />
            )}
          </div>
        </div>
      )}

      {/* Medium layout (lg to xl): Chart full width + OrderBook|OrderForm side by side */}
      <div className="hidden lg:block xl:hidden space-y-3">
        {isSimple ? (
          <>
            <div style={{ height: `${CHART_HEIGHT}px` }}>
              <ChartArea
                chartView={chartView}
                onChartViewChange={setChartView}
                currentPrice={displayPrice}
                bids={orderbook.bids}
                asks={orderbook.asks}
                midPrice={midPrice}
              />
            </div>
            <TradingPanel mode={mode} />
          </>
        ) : (
          <>
            <div style={{ height: `${CHART_HEIGHT}px` }}>
              <ChartArea
                chartView={chartView}
                onChartViewChange={setChartView}
                currentPrice={displayPrice}
                bids={orderbook.bids}
                asks={orderbook.asks}
                midPrice={midPrice}
              />
            </div>
            <div className="flex gap-3">
              <div className="flex-1 min-w-0">
                <div className="bg-theme-bg-secondary rounded-lg p-3" style={{ height: "400px" }}>
                  <Orderbook orderbook={orderbook} onPriceClick={handlePriceClick} isError={isOrderbookError} />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <TradingPanel mode={mode} />
              </div>
            </div>
            <BottomTabPanel />
          </>
        )}
      </div>

      {/* Mobile: scrollable single-page layout (below lg) */}
      <MobileTradeLayoutV2
        chartContent={
          <ChartArea
            chartView={chartView}
            onChartViewChange={setChartView}
            currentPrice={displayPrice}
            bids={orderbook.bids}
            asks={orderbook.asks}
            midPrice={midPrice}
          />
        }
        tradeContent={
          <>
            <EnablePadoCard />
            <TradingPanel mode={mode} />
          </>
        }
        bids={orderbook.bids}
        asks={orderbook.asks}
        midPrice={midPrice}
        onPriceClick={handlePriceClick}
        bottomTabContent={!isSimple ? <BottomTabPanel /> : undefined}
        miniTicker={marketInfo}
        isSimple={isSimple}
      />

      {/* Floating chat popup (xl+ only, when popped out) */}
      {chatFloating && (
        <div className="hidden xl:block">
          <FloatingChatPopup onDock={() => setChatFloating(false)} />
        </div>
      )}

      {/* Chat drawer (below xl) — available at both lg-xl and mobile */}
      <MobileChatDrawer />

      {/* First trade celebration overlay */}
      {showCelebration && <FirstTradeCelebration onDismiss={dismissCelebration} />}

      {/* Onboarding tour overlay */}
      <OnboardingTour tour={tour} />

      {/* Keyboard shortcuts panel (Pro mode, ? key) */}
      {!isSimple && (
        <KeyboardShortcutsPanel
          isOpen={shortcutsPanelOpen}
          onClose={() => setShortcutsPanelOpen(false)}
        />
      )}
    </div>
  );
}

export function TradePage() {
  return (
    <MarketProvider>
      <OrderFormProvider>
        <TradePageContent />
      </OrderFormProvider>
    </MarketProvider>
  );
}
