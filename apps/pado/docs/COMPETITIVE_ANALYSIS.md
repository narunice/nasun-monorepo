# Pado DEX - Competitive Analysis & Improvement Roadmap

> Last updated: 2026-02-09

## Overview

Comparison of Pado's spot trading UI/UX against leading CEX and DEX platforms in 2026.

## Scoring Summary (out of 100)

| Category       | Pado | Bybit | Binance | Hyperliquid | dYdX | Jupiter |
|----------------|------|-------|---------|-------------|------|---------|
| Charts         | 85   | 95    | 95      | 85          | 80   | 40      |
| Order Types    | 80   | 90    | 95      | 75          | 70   | 45      |
| Orderbook/Depth| 75   | 90    | 90      | 80          | 75   | 30      |
| UX/Interaction | 80   | 90    | 85      | 70          | 70   | 65      |
| Social/Gamif.  | 60   | 85    | 80      | 50          | 45   | 60      |
| Portfolio/PnL  | 70   | 95    | 95      | 75          | 75   | 50      |
| Mobile/Perf.   | 40   | 95    | 95      | 70          | 65   | 70      |
| Onboarding     | 80   | 85    | 85      | 60          | 65   | 75      |
| **Overall**    | **74** | **91** | **90** | **75**    | **72** | **54** |

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
- Global chat with trade notifications
- Leaderboard system
- Step-by-step onboarding tour for new users
- Keyboard shortcuts (B/S/L/M/Esc)
- Dark/light theme support

## Key Gaps

### 1. Mobile/Performance (40/100) - BIGGEST REMAINING GAP
- No native mobile app
- Web performance not optimized for mobile
- Touch interactions limited
- No PWA support

### 2. Social/Gamification (60/100)
- No copy trading
- No trading bot SDK for users
- Chat exists but no trade-sharing or social feeds

### 3. Portfolio/PnL (70/100)
- PnL chart and cost basis tracking implemented
- Still missing: portfolio analytics dashboard, CSV export, date range filters

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

### P8: Trade History Filters
- **Impact**: Portfolio +5
- **Effort**: Low
- Filter by market, date range, side (buy/sell)
- CSV export (already partially implemented)

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

P1-P7 and P11 are completed (2026-02-09). Overall score improved from 60 to 74.

Next priorities by impact-to-effort ratio:
1. **P8** (Trade History Filters) - Low effort, completes portfolio gap
2. **P9** (Copy Trading) - High impact on social score, but high effort
3. **P13** (WebSocket) - Significant perf improvement
4. **P15** (Native Mobile) - Closes biggest remaining gap but very high effort
