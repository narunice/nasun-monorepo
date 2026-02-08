# Pado DEX - Competitive Analysis & Improvement Roadmap

> Last updated: 2026-02-08

## Overview

Comparison of Pado's spot trading UI/UX against leading CEX and DEX platforms in 2026.

## Scoring Summary (out of 100)

| Category       | Pado | Bybit | Binance | Hyperliquid | dYdX | Jupiter |
|----------------|------|-------|---------|-------------|------|---------|
| Charts         | 45   | 95    | 95      | 85          | 80   | 40      |
| Order Types    | 70   | 90    | 95      | 75          | 70   | 45      |
| Orderbook/Depth| 75   | 90    | 90      | 80          | 75   | 30      |
| UX/Interaction | 65   | 90    | 85      | 70          | 70   | 65      |
| Social/Gamif.  | 60   | 85    | 80      | 50          | 45   | 60      |
| Portfolio/PnL  | 55   | 95    | 95      | 75          | 75   | 50      |
| Mobile/Perf.   | 40   | 95    | 95      | 70          | 65   | 70      |
| Onboarding     | 70   | 85    | 85      | 60          | 65   | 75      |
| **Overall**    | **60** | **91** | **90** | **75**    | **72** | **54** |

## Current Pado Strengths

- Real CLOB orderbook (DeepBook V3) - rare among DEXs
- Multi-market support (NBTC, NETH, NSOL)
- TP/SL with keeper bot (server-side execution)
- 7 technical indicators (SMA, EMA, RSI, MACD, BB, VWAP, Stochastic)
- 3 drawing tools (horizontal line, trend line, fibonacci)
- Real-time price alerts
- Global chat with trade notifications
- Leaderboard system
- Keyboard shortcuts (B/S/L/M/Esc)
- Dark/light theme support

## Key Gaps

### 1. Charts (45/100) - BIGGEST GAP
- Only 7 indicators vs 100+ on major platforms
- 3 drawing tools vs 50+ (TradingView standard)
- No multi-timeframe analysis
- No chart templates or saved layouts
- No comparison overlays
- Custom implementation means ongoing maintenance burden

### 2. Mobile/Performance (40/100)
- No native mobile app
- Web performance not optimized for mobile
- Touch interactions limited
- No PWA support

### 3. Portfolio/PnL (55/100)
- Basic trade history
- No equity curve or PnL charts
- No portfolio analytics or drawdown metrics
- Limited export options

### 4. UX/Interaction (65/100)
- No order size slider (% of balance)
- No price impact warnings
- No advanced order types (trailing stop, OCO)
- No trade confirmation modal with summary

## Prioritized Improvements

### P1: TradingView Advanced Charts Integration
- **Impact**: Charts 45 -> 90 (+45 points)
- **Effort**: Medium (Datafeed adapter + widget integration)
- **Status**: Plan approved, implementation pending
- **Details**: Replace lightweight-charts with TradingView Advanced Charts
  - 100+ built-in indicators, 110+ drawing tools
  - Professional chart templates and layouts
  - Multi-timeframe analysis support
  - Free license eligible (non-commercial devnet project)
  - Feature flag for safe rollback

### P2: Order Size Slider (% of Balance)
- **Impact**: UX 65 -> 75 (+10 points)
- **Effort**: Low (1-2 files)
- Drag slider: 25% / 50% / 75% / 100%
- Auto-calculate quantity from balance

### P3: Market Stats Bar (24h Volume, Change, High/Low)
- **Impact**: UX +5, Portfolio +5
- **Effort**: Low (1 component)
- Display 24h metrics above the chart
- Already have price data from Binance API

### P4: Price Impact Warning
- **Impact**: UX +5
- **Effort**: Low
- Show estimated slippage for market orders
- Warn when order size exceeds top-of-book liquidity

### P5: PnL Chart (Equity Curve)
- **Impact**: Portfolio 55 -> 70 (+15 points)
- **Effort**: Medium
- Track realized PnL over time
- Show cumulative returns chart

### P6: Trailing Stop Order
- **Impact**: Order Types 70 -> 80 (+10 points)
- **Effort**: Medium
- Extend TPSL keeper with trailing stop logic
- UI: trailing distance input (% or absolute)

### P7: Watchlist / Favorites
- **Impact**: UX +5
- **Effort**: Low
- Star markets, persistent via localStorage
- Quick-switch between favorite markets

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

### P11: Onboarding Tour
- **Impact**: Onboarding 70 -> 85 (+15 points)
- **Effort**: Low
- Step-by-step tutorial overlay for new users
- Highlight key UI elements

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

The improvements are ordered by impact-to-effort ratio. P1 (TradingView) is the clear first priority as it closes the biggest gap (charts) with moderate effort and eliminates ongoing indicator/drawing maintenance.

After P1, P2-P4 are quick wins that significantly improve trading UX. P5-P8 build out portfolio and order management. P9+ are larger features for later phases.
