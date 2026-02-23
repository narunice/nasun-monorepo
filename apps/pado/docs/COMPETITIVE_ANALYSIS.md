# Pado DEX - Competitive Analysis & Improvement Roadmap

> Last updated: 2026-02-23

## Overview

Comparison of Pado's spot trading UI/UX against leading CEX and DEX platforms in 2026.

## Scoring Summary (out of 100)

| Category       | Pado | Bybit | Binance | Hyperliquid | dYdX | Jupiter |
|----------------|------|-------|---------|-------------|------|---------|
| Charts         | 85   | 95    | 95      | 85          | 80   | 40      |
| Order Types    | 80   | 90    | 95      | 75          | 70   | 45      |
| Orderbook/Depth| 75   | 90    | 90      | 80          | 75   | 30      |
| UX/Interaction | 85   | 90    | 85      | 70          | 70   | 65      |
| Social/Gamif.  | 88   | 85    | 80      | 50          | 45   | 60      |
| Portfolio/PnL  | 80   | 95    | 95      | 75          | 75   | 50      |
| Mobile/Perf.   | 75   | 95    | 95      | 70          | 65   | 70      |
| Onboarding     | 90   | 85    | 85      | 60          | 65   | 75      |
| **Overall**    | **86** | **91** | **90** | **75**    | **72** | **54** |

## Current Pado Strengths

- Real CLOB orderbook (DeepBook V3) - rare among DEXs
- Multi-market support (NBTC, NETH, NSOL, NASUN)
- TradingView Advanced Charts (100+ indicators, 110+ drawing tools)
- TP/SL + Trailing Stop with keeper bot (server-side execution)
- Price impact warnings with VWAP calculation (both Simple and Pro modes)
- Quick amount buttons (25%/50%/75%/100% of balance)
- Market stats bar (24h volume, high/low, change %)
- Favorites quick-switch strip for one-click market switching
- PnL equity curve with realized/unrealized split and max drawdown
- Per-market performance table with P&L, volume, win rate breakdown
- Advanced risk metrics (Sharpe Ratio, Profit Factor, Expectancy)
- Portfolio summary CSV export (holdings, P&L, per-market stats)
- Followed traders system with localStorage persistence
- Global chat with trade notifications and large trade alerts
- Market Narrator bot (rule-based price/volume/momentum alerts + optional AI summaries)
- PnL share cards for social sharing of trading performance
- Achievement badges system (volume, streak, PnL milestones)
- Trading competitions with time-limited leaderboards
- Leaderboard system with trader profiles and follow/unfollow
- Step-by-step onboarding tour for new users
- Keyboard shortcuts (B/S/L/M/Esc)
- Dark/light theme support
- PWA support (installable, offline-capable via vite-plugin-pwa)
- Passkey authentication (device credentials, biometric login)
- Points system with trade/volume/diversity scoring + Points leaderboard tab
- TP/SL keeper bot with server-side execution (TradeCap delegation, port 4001)
- Passkey wallet support (device credential-based authentication)

## Key Gaps

### 1. Mobile/Performance (75/100) - Improved
- No native mobile app (web responsive improved with adaptive intervals + lazy loading)
- Mobile chart height improved: `min(40vh, 350px)` (was fixed 250px)
- MiniOrderbook now shows 8 levels (was 5)
- Loading skeletons added to major pages
- PWA support (vite-plugin-pwa: installable, service worker caching)
- Remaining gap: native app, touch gestures

### 2. Social/Gamification (88/100) - Now exceeds Bybit/Binance
- Points system with trade/volume/diversity scoring + Points leaderboard tab
- Enhanced share cards with "Built by 2 people" watermark, one-click Twitter share
- Followed traders, leaderboard trader profiles, large trade alerts in chat
- Market Narrator bot, PnL share cards, badges, trading competitions all implemented
- No copy trading (would require smart contract changes)
- No trading bot SDK for users

### 3. Portfolio/PnL (80/100)
- PnL chart, cost basis, per-market performance, risk metrics, CSV export, period filters all implemented
- Still missing: tax lot reporting, multi-account aggregation

## Prioritized Improvements

### P1: TradingView Advanced Charts Integration -- COMPLETED
- **Impact**: Charts 45 -> 85 (+40 points)
- **Status**: Deployed with feature flag
- TradingView Advanced Charts widget with custom Datafeed adapter
- 100+ indicators, 110+ drawing tools, multi-timeframe analysis

### P2: Order Size Slider (% of Balance) -- COMPLETED
- **Impact**: UX +10
- **Status**: Deployed (QuickAmountButtons: 25%/50%/75%/100%)

### P3: Market Stats Bar (24h Volume, Change, High/Low) -- COMPLETED
- **Impact**: UX +5, Portfolio +5
- **Status**: Deployed (MarketInfoBar with Binance 24h data)

### P4: Price Impact Warning -- COMPLETED
- **Impact**: UX +5
- **Status**: Deployed in both Pro mode (OrderForm) and Simple mode (SwapOrderForm)
- VWAP-based calculation, color-coded thresholds, insufficient liquidity warning

### P5: PnL Chart (Equity Curve) -- COMPLETED
- **Impact**: Portfolio +15
- **Status**: Deployed with realized/unrealized split, max drawdown stat

### P6: Trailing Stop Order -- COMPLETED
- **Impact**: Order Types +10
- **Status**: Deployed (keeper bot + UI trailing distance input)

### P7: Watchlist / Favorites -- COMPLETED
- **Impact**: UX +5
- **Status**: Deployed (star toggle in MarketSelector + FavoriteStrip quick-switch)

### P8: Trade History Filters -- COMPLETED
- **Impact**: Portfolio +5
- **Status**: Deployed (side, market, period filters + CSV export in RecentTrades)

### P16: Per-Market Performance Table -- COMPLETED
- **Impact**: Portfolio +5
- **Status**: Deployed (MarketPerformance component with P&L, volume, win rate per pool)

### P17: Advanced Risk Metrics -- COMPLETED
- **Impact**: Portfolio +5
- **Status**: Deployed (Sharpe Ratio, Profit Factor, Avg Win/Loss, Expectancy in TradeStats)

### P18: Portfolio Summary Export -- COMPLETED
- **Impact**: Portfolio +5
- **Status**: Deployed (multi-section CSV from AssetOverview: summary, holdings, per-market, stats)

### P9: Copy Trading (Social)
- **Impact**: Social 60 -> 80 (+20 points)
- **Effort**: High
- Follow top leaderboard traders
- Mirror trades proportionally
- Requires smart contract changes

### P10: OCO Orders (One-Cancels-Other)
- **Impact**: Order Types +5
- **Effort**: Medium
- Bracket orders: entry + TP + SL linked
- Cancel remaining when one fills

### P11: Onboarding Tour -- COMPLETED
- **Impact**: Onboarding 70 -> 80 (+10 points)
- **Status**: Deployed (auto-start on first visit, 8-step tour)

### P12: Trading Bot SDK
- **Impact**: Social +10
- **Effort**: High
- User-configurable grid/DCA strategies
- Visual bot performance tracking

### P13: WebSocket Real-time Updates
- **Impact**: Mobile/Perf +15
- **Effort**: Medium
- Replace polling with WebSocket for orderbook/trades
- Reduce bandwidth and latency

### P14: i18n (Korean + Japanese)
- **Impact**: Onboarding +5
- **Effort**: Medium
- Multi-language support
- RTL consideration for future Arabic support

### P15: Native Mobile App (React Native / Capacitor)
- **Impact**: Mobile 40 -> 80 (+40 points)
- **Effort**: Very High
- Native performance and push notifications
- Biometric authentication

## Implementation Order

P1-P8, P11, and P16-P18 are completed (2026-02-14). Phase 22 Testnet Launch Polish (T1+T2) completed 2026-02-15.
Overall score improved from 60 to 86. Points system, enhanced share cards, loading skeletons, actionable errors, mobile UX, onboarding flow all added.
PWA support, passkey auth, TP/SL keeper (server-side execution), and social layer features (Market Narrator, PnL share, badges, competitions) added since initial completion.

Next priorities by impact-to-effort ratio:

1. **P13** (WebSocket) - Significant perf improvement, medium effort
2. **P9** (Copy Trading) - High impact on social score, but high effort
3. **P15** (Native Mobile) - Closes biggest remaining gap but very high effort
