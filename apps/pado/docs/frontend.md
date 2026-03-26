# Pado Frontend Reference

> Last Updated: 2026-03-26

## Routes

| Route | Page | Description |
|-------|------|-------------|
| `/` | HomePage | Dashboard (portfolio when connected, onboarding when not) |
| `/markets/spot` | TradePage | Spot trading (Simple/Pro mode, orderbook, chart) |
| `/markets/perp` | PerpTradePage | Perpetual futures trading |
| `/wallet` | WalletPage | Send/receive/history/settings + UnifiedBalanceCard |
| `/predict` | PredictPage | Prediction market list |
| `/predict/:marketId` | PredictMarketPage | Individual market detail (YES/NO orderbook) |
| `/lottery` | LotteryPage | Current round + ticket purchase |
| `/lottery/:roundId` | LotteryRoundPage | Round detail + my tickets |
| `/earn` | EarnPage | Staking + Lending (UI stub) |
| `/portfolio` | PortfolioPage | Asset overview, P&L chart, trade/transfer history, risk metrics |
| `/admin` | AdminPage | Unified admin (Prediction + Lottery tabs) |
| `/leaderboard` | LeaderboardPage | Trading volume/PnL rankings |
| `/leaderboard/trader/:address` | TraderProfilePage | Trader detail (stats, fills, badges) |
| `/competitions` | CompetitionsPage | Trading competition list |
| `/competitions/:id` | CompetitionDetailPage | Competition detail + leaderboard |
| `/callback` | AuthCallbackPage | zkLogin OAuth callback |

**Navigation Structure (Menu v3)**:
- Desktop: Trade (Spot, Perp) | Predict | Lottery | Earn | Social (Leaderboard, Competitions) | Portfolio
- Mobile: Home | Trade | Predict | Social | More (Lottery, Earn, Perp, Portfolio, Wallet)

---

## Feature Modules

### trading/ - Spot DEX (DeepBook V3 CLOB)

Orderbook-based spot trading. 4 pools (NBTC, NETH, NSOL, NASUN / NUSDC). Simple/Pro mode.

**Components**: MarketSelector, PriceChart (SMA/EMA/RSI/MACD/BB/ATR/Stochastic/VWAP/Ichimoku), Orderbook, OrderForm, SimpleOrderForm, SwapOrderForm, ScaleOrderForm, MarketInfoBar, BalanceManagerCard, OpenOrders, TradeHistory, TradingBalanceBar, PoolInfo, PriceSuggestions, SlippageSettings, QuickAmountButtons, TPSLInputs, InsufficientBalancePrompt, OrderConfirmModal, BottomTabPanel, DrawingToolbar (Trend/Fibonacci/Horizontal lines), NotificationSettings, KeyboardShortcutsPanel, OnboardingTour, MobileTradeLayoutV2, FavoriteStrip, DepthChart, ChartContextMenu (right-click/long-press chart-to-order)

**Containers**: TradingPanel, MarketPanel, BalancePanel

**Context**: MarketContext (current pool selection), OrderFormContext (order state, one-click trading)

**Hooks**: useTradeMode, useOrderbook, useOpenOrders, useOrderActions, useFaucet, useAutoDeposit, useBalanceManagerBalance, useTradeEvents, useMyTrades, useFavoriteMarkets, useOrderFillNotifier, usePriceAlertMonitor, useTPSLMonitor, useKeyboardShortcuts, useOnboardingTour, useTransactionExecutor, useTradeCap, useOrderHistory

### perp/ - Perpetual Futures (Phase 11)

Up to 20x leverage, 8h funding rate, liquidation engine.

**Components**: PerpOrderForm, PerpPositionList, LeverageSlider (1-20x), LiquidationWarning, PerpMarketInfo

**Hooks**: usePerpOrder, usePerpPositions, usePerpMarket, useOraclePrice

**Context**: PerpMarketContext

**Lib**: perp-client.ts (on-chain contract interaction)

### prediction/ - Prediction Markets

Binary YES/NO prediction markets. NUSDC collateral, orderbook-based.

**Components**: MarketCard, MarketHeader, OutcomeOrderForm, OutcomeOrderbook, PositionList, CreateMarketForm, AdminResolveModal, PredictionAdminPanel

**Hooks**: useMarkets, useMarket, useMarketOrderbook, usePredictionTrade, usePredictionPositions, usePredictionAdmin

**Lib**: prediction-market.ts (probability calculation)

### lottery/ - Weekly Lottery

Pick 5 numbers (1-32), Sui Random based drawing, multi-tier prizes.

- Ticket price: 1 NUSDC
- Max 100 tickets per address
- Prizes: Jackpot 60% (5 match), 2nd 25% (4 match), 3rd 15% (3 match)
- Pool distribution: 70% winners, 20% rollover, 10% treasury

**Components**: TicketPurchaseForm, LotteryRoundCard, MyTicketList, WinningNumbers, LotteryCountdown, LotteryAdminPanel (CreateRoundForm, RoundCard, StatusBadge)

**Hooks**: useLotteries, useLotteryRound, useMyTickets, useLotteryActions, useLotteryAdmin, useLotteryKeeper

**Lib**: lottery-client.ts (number matching, prize calculation)

### portfolio/ - Asset Overview & History

Net worth dashboard, P&L time series, risk metrics, CSV export, token sparklines.

**Components**: AssetOverview, TokenBalanceList, TokenSparkline (24h mini-chart via Binance klines), PnlChart (realized/unrealized P&L split), AllocationDonut (token allocation pie), ActivityTabs, RecentTrades, TransferHistory (direction/token filters), TradeStats (Sharpe Ratio, Profit Factor, Max Drawdown, Sortino Ratio, Win Rate)

**Hooks**: useTotalValue, useTradeHistory, useTransferHistory, usePnlTimeSeries, useCostBasis, useTokenSparkline

### dashboard/ - Homepage Components

Onboarding and quick access widgets.

**Components**: WelcomeBanner, QuickActions, HotMarketsCard, PredictionHighlight, NetWorthCard

### earn/ - Staking & Lending (Phase 12-13, UI stub)

Interest-earning activities. Lending contract V7 deployed, UI is stub state.

**Components**: StakingSection, LendingSection, DepositForm, PoolStats, PositionList

**Hooks**: useLendingPool, useLendingPositions, useLendingActions

**Lib**: lending-client.ts

### core/ - Foundation Modules

Unified Margin, Smart Account, Oracle integrated data layer.

**unified-margin/**: useMarginAccount, useUnifiedMargin, useUnifiedBalance, useSmartAccount, useRiskEngine, UnifiedBalanceCard, SmartAccountPanel, MarginAccountCard

**usePrices.ts**: Unified price source for all tokens (Oracle + Binance fallback, 10s cache TTL)

### payments/ - Fast Transfer

QR code based payment reception.

**Components**: PaymentQRCode

### social/ - Global Chat + Share (Phase 19)

Real-time chat (WebSocket), nickname setting, PnL sharing, trading page integration.

**Components**: ChatPanel, ChatMessage (normal/system/BOT/trade-share styling), ChatInput, ChatToggleButton, FloatingChatPopup, MobileChatDrawer, SetNicknameModal, ShareCardModal (Canvas-based image generation), ShareTradeButton, SharePnlButton, SharePortfolioButton

**Hooks**: useChat, useChatPanel, useFloatingPanel, useChatTextSize

### badges/ - Achievement System

Trading performance based badge system.

**Components**: BadgeDisplay (grid), BadgeNotification

### leaderboard/ - Trading Volume Rankings (Phase 19)

DeepBook OrderFilled event based trading volume/PnL rankings.

**Components**: LeaderboardTable, TraderRow, RankBadge, PeriodSelector, MyRankCard, TraderProfileHeader, TraderFillsTable, BadgeDisplay

**Hooks**: useLeaderboard, useTraderStats, useTraderFills, useFollowedTraders, useTraderClassification

### competitions/ - Trading Competitions (Phase 19)

Time-limited trading contests, dedicated leaderboard.

**Components**: CompetitionCard, CompetitionBanner, CompetitionLeaderboard, CompetitionCountdown

**Hooks**: useCompetitions, useCompetition

### news/ - News Carousel

News card slider.

**Components**: NewsCarousel, NewsCard

**Hooks**: useNewsFeed

### admin/ - Admin Dashboard

Prediction + Lottery integrated admin panel. AdminCap-based access control.

**Hooks**: useAdminAccess (isPredictionAdmin, isLotteryAdmin)

---

## Frontend Libraries (lib/)

| File | Description |
|------|-------------|
| `sui-client.ts` | SuiClient singleton, faucet requests, balance queries, formatting |
| `deepbook.ts` | Level 2 orderbook query, order type conversion, maker/taker fee logic |
| `oracle-client.ts` | DevOracle on-chain price query (BTC/USD, ETH/USD, NAS/USD) |
| `event-service.ts` | Event subscription (WebSocket -> Polling -> Simulation auto fallback) |
| `prices.ts` | Unified price source (10s cache TTL, Oracle + Binance fallback) |
| `risk-engine.ts` | Margin validation (10% buffer), shortfall calculation |
| `unified-margin.ts` | MarginAccount storage/query, multi-collateral tracking |
| `chat-service.ts` | WebSocket chat client (connection, messaging, nickname) |
| `csv-export.ts` | Trade history CSV export |
| `notification-preferences.ts` | Notification settings (sound/browser) localStorage storage |
| `browser-notify.ts` | Browser Notification API wrapper |
| `sounds.ts` | Trade success/fill sound effects |
| `constants.ts` | Global constants |
| `logger.ts` | Logging utility |
| `pado-api.ts` | Pado backend API client (chat, leaderboard, competitions, predictions) |
| `tx-helpers.ts` | Transaction helper utilities |
| `https-browser-stub.ts` | HTTPS module browser stub for Node.js dependencies |
| `indicators/` | Technical indicators: SMA, EMA, RSI, MACD, BB (Bollinger Bands), ATR, Stochastic, VWAP, Ichimoku Cloud |
| `tradingview/` | TradingView Lightweight Charts wrapper + Datafeed adapter |
