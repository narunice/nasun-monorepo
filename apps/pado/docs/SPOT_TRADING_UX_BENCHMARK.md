# Pado Spot Trading & Account UX — Competitive Benchmark Analysis

> Date: 2026-03-03
> Scope: Spot Trading UI/UX + Account/Wallet Management UX
> Context: Public testnet launch preparation — Spot Trading & Account screens ship first

---

## 1. Spot Trading UI/UX — Comparative Scoring (100pts)

| Category | Pado | Hyperliquid | Binance | Coinbase Adv | Lighter | Cetus (Sui) |
|----------|------|-------------|---------|-------------|---------|-------------|
| **Layout & Panels** | 82 | 85 | 92 | 88 | 83 | 55 |
| **Order Type Diversity** | 92 | 90 | 95 | 78 | 85 | 60 |
| **Orderbook Design** | 78 | 88 | 90 | 85 | 82 | N/A |
| **Chart & TA Tools** | 82 | 82 | 95 | 95 | 80 | 60 |
| **Simple/Beginner Mode** | 85 | 40 | 88 | 90 | 30 | 80 |
| **Mobile UX** | 80 | 50 | 95 | 92 | 55 | 70 |
| **Onboarding Friction** | 90 | 85 | 60 | 45 | 80 | 85 |
| **Feedback & Error Handling** | 80 | 75 | 88 | 85 | 70 | 65 |
| **Advanced Features (TP/SL)** | 88 | 85 | 90 | 75 | 80 | 40 |
| **Visual Design Quality** | 80 | 78 | 90 | 92 | 80 | 70 |
| **Overall** | **85** | **76** | **91** | **85** | **73** | **65** |

### Key Insight

Pado is functionally superior to most DEXs (92pts order types, 88pts TP/SL) but lags behind in visual polish (73pts) and mobile UX (72pts). The gap vs. Binance/Coinbase is primarily aesthetic, not functional.

---

## 2. Pado Strengths (Competitive Advantages)

### 2.1 Order Type Diversity (92pts) — Best Among DEXs

- Limit, Market, Stop-Limit, Trailing Stop, **Scale Orders** (Hyperliquid-level)
- Execution options: GTC / IOC / FOK / POST_ONLY
- TP/SL with OCO linking + Server-side Keeper execution
- No other Sui DEX (Cetus, Turbos, BlueMove) offers anything close to this

### 2.2 Simple/Pro Dual Mode (85pts) — Binance/Coinbase Pattern

- Simple: Uniswap-style Swap UI ("You Pay" -> "You Receive")
- Pro: Full CLOB trading (5 order types + keyboard shortcuts)
- 3-view flow in Simple mode (Form -> Confirm -> Success)
- Progressive disclosure done right

### 2.3 Onboarding Friction (90pts) — Lowest Among All Platforms

- Embedded Wallet + zkLogin + Passkey = 3 frictionless entry paths
- No KYC (vs. Binance/Coinbase mandatory KYC)
- GettingStartedCard 3-step checklist with real-time progress tracking
- Sub-60 second first trade (Faucet instant)
- Ahead of 2025-2026 industry trend of "walletless onboarding"

### 2.4 TP/SL Keeper System (88pts) — Unique DEX Feature

- Browser-only + Server-side dual execution modes
- TradeCap delegation (no private key exposure for server execution)
- Status badge transparently shows execution mode
- Health monitoring with automatic browser fallback
- No competitor DEX offers this level of TP/SL execution transparency

### 2.5 Keyboard Shortcuts (Pro Mode)

- 1-9: 10%-90% amount, 0: 100%, +/-: tick up/down, Enter: submit, ?: help
- T: toggle orderbook/trades tab
- One-click trading toggle
- Matches Hyperliquid and exceeds most DEXs

---

## 3. Pado Weaknesses (Improvement Areas)

### 3.1 Visual Design Quality (73pts) — Largest Gap

**Gap**: -17pts vs Binance, -19pts vs Coinbase

**Current State**:
- Tailwind utility-class based — functional but lacks "polished" feel
- Color palette is flat (no gradients, glows, or depth cues)
- Typography hierarchy inconsistent across components
- Card/panel depth is uniform (flat borders, no shadows)
- Buy/Sell buttons visually understated

**Benchmark — Coinbase Advanced**:
- Consistent 8px grid system for all spacing
- Subtle shadows and border-opacity create depth hierarchy
- Typography: clear 3-level hierarchy (heading / body / helper)
- Color palette: muted backgrounds with high-contrast accent elements

**Benchmark — Lighter.xyz**:
- Subtle gradient backgrounds on cards
- Glow effects on active elements
- Premium, "dark mode done right" aesthetic
- Clean separation between information zones

**Benchmark — Binance**:
- Strong Buy/Sell button presence (saturated colors + hover effects + micro-shadows)
- Gradient depth bars in orderbook
- Consistent spacing rhythm throughout all panels

### 3.2 Orderbook Design (78pts)

**Gap**: -12pts vs Binance, -10pts vs Hyperliquid

**Current State**:
- Basic heatmap bars for cumulative depth
- Spread display: mid price + gap only
- Grouping via dropdown selector
- Last trade: fade-in animation only
- Compact mode available but visually basic

**Benchmark — Binance**:
- Gradient depth bars (semi-transparent overlay, not solid fill)
- Spread shown as % and absolute value
- Grouping via +/- buttons (instant adjustment, no dropdown)
- Last trade: directional arrow + flash highlight effect
- Price click: highlights the clicked level briefly

**Benchmark — Hyperliquid**:
- Full on-chain orderbook with real-time WebSocket updates
- Cumulative size visualization
- Best Bid/Offer (BBO) prominently displayed
- Spread percentage always visible

### 3.3 Chart & Technical Analysis (75pts)

**Gap**: -20pts vs Binance/Coinbase

**Current State**:
- TradingView **Lightweight Charts** (not full TradingView)
- 7 indicators: SMA, EMA, RSI, MACD, BB, ATR, Stochastic
- Drawing tools: Trend line, Fibonacci, Horizontal line (3 tools)
- Basic timeframe set

**Benchmark — Coinbase Advanced**:
- Full TradingView integration (not Lightweight)
- **104 technical indicators**
- Complete drawing tool suite (Fibonacci, Gann, Pitchfork, etc.)
- Chart types: candlestick, line, bar, area
- Save/load chart layouts
- Trade from chart (click price level to populate order)

**Benchmark — Binance**:
- Full TradingView with hundreds of indicators
- Pine Script custom indicator support
- Chart-to-order integration
- Multi-timeframe analysis views
- Direct TradingView.com integration (trade from TradingView site)

**Note**: Full TradingView requires a commercial license. Lightweight Charts is free/open-source but limited. This is a cost vs. capability trade-off.

### 3.4 Mobile UX (72pts)

**Gap**: -23pts vs Binance, -20pts vs Coinbase

**Current State**:
- MobileTradeLayoutV2: scrollable single-page layout (good base)
- Chart: max 350px height
- Mini orderbook: 5 levels only
- No sticky Buy/Sell buttons (buried in scroll)
- No swipe gestures
- Bottom nav with 5 tabs + "More" sheet

**Benchmark — Binance Mobile**:
- **Sticky Buy/Sell buttons** fixed at screen bottom (always visible)
- Full-screen chart mode (tap to expand)
- Swipe left/right between panels (chart <-> orderbook <-> history)
- Touch targets: 48px minimum throughout
- Lite/Pro mode toggle at top
- AI-personalized widget layout

**Benchmark — Turbos Finance (Sui)**:
- **Quick Trading Panel**: execute trades directly from token pages without navigation
- Optimized for meme coin speed trading
- Dedicated mobile app with recent major UX overhaul

### 3.5 Layout Flexibility (82pts)

**Gap**: -10pts vs Binance

**Current State**:
- Fixed column widths (300px orderbook, 300px order form)
- No drag-to-resize panels
- Depth Chart hidden inside Chart toggle (low discoverability)
- News carousel under order form (distracts from trading)

**Benchmark — Binance**:
- Drag-and-drop panel customization
- Resizable columns
- Module add/remove system
- AI-recommended layout based on trading style ("UI Refined" feature)

---

## 4. Account/Wallet Management — Comparative Scoring

| Category | Pado | Binance | Coinbase | Hyperliquid |
|----------|------|---------|---------|-------------|
| **Wallet Connect/Create** | 92 | 70 | 65 | 82 |
| **Balance Display** | 80 | 90 | 92 | 75 |
| **Deposit/Withdraw** | 75 | 95 | 95 | 78 |
| **Portfolio Overview** | 82 | 88 | 90 | 70 |
| **Security Management** | 72 | 85 | 88 | 65 |
| **Mobile Account UX** | 75 | 92 | 95 | 55 |
| **Overall** | **79** | **87** | **88** | **71** |

### Account Strengths

1. **Frictionless wallet creation (92pts)** — 3 methods (Google zkLogin, Passkey, seed phrase), no KYC, instant
2. **Unified Balance View** — Wallet + Trading + Margin aggregated in one card with progressive disclosure
3. **GettingStartedCard** — 3-step onboarding with real-time progress tracking and auto-dismiss

### Account Weaknesses

1. **Balance Display (80pts)** — text-only token list, no mini charts or allocation visualizations
2. **Deposit/Withdraw UX (75pts)** — manual Pado Balance deposit; Auto-deposit exists but UI guidance is minimal
3. **Security Dashboard (72pts)** — basic SecuritySettings, no security score or visual checklist
4. **Transfer History (75pts)** — no filters (date range, token type, direction), no search

---

## 5. Benchmark Targets — What To Adopt

### From Coinbase Advanced (Visual + Account UX)

| Pattern | Description | Priority |
|---------|-------------|----------|
| 8px grid system | Consistent spacing rhythm across all components | High |
| Typography hierarchy | 3 clear levels with consistent weight/size mapping | High |
| Subtle depth | Border-opacity + micro-shadows on cards/panels | High |
| Token sparkline charts | 24h mini price charts next to each token in balance list | Medium |
| Asset allocation donut | Visual pie chart of portfolio allocation | Medium |
| Security score dashboard | Visual checklist of security features enabled | Low |

### From Binance (Trading + Mobile)

| Pattern | Description | Priority |
|---------|-------------|----------|
| Sticky Buy/Sell buttons (mobile) | Fixed at bottom of screen, always visible | High |
| Orderbook gradient depth bars | Semi-transparent gradient overlay instead of solid fill | High |
| Grouping +/- buttons | Replace dropdown with instant +/- step adjustment | Medium |
| Last trade flash effect | Directional arrow + color flash on new trades | Medium |
| Full-screen chart mode (mobile) | Tap-to-expand chart for detailed analysis | Medium |
| Panel resize | Drag handles between columns for custom width | Low |

### From Lighter.xyz (Dark Theme Polish)

| Pattern | Description | Priority |
|---------|-------------|----------|
| Card depth with subtle glow | Active panels get faint colored border glow | Medium |
| Background gradient zones | Subtle gradient shift between major UI sections | Medium |
| CTA button presence | Strong visual weight on primary action buttons | High |

### From Hyperliquid (Orderbook + Trading)

| Pattern | Description | Priority |
|---------|-------------|----------|
| Spread % display | Show spread as percentage alongside absolute value | High |
| BBO (Best Bid/Offer) highlight | Prominent display of top bid/ask prices | Medium |
| Scale Orders UX | Already implemented in Pado -- maintain parity | N/A |

### From Turbos Finance (Mobile Innovation)

| Pattern | Description | Priority |
|---------|-------------|----------|
| Quick Trade Panel | Inline trading without page navigation | Low |

---

## 6. Implementation Priority Matrix

### Phase A — Visual Polish (Impact: High, Effort: Medium) ✅ Complete

1. ✅ Trading color & typography standardization (8px grid, 3-level type scale)
2. ✅ Buy/Sell button visual reinforcement (stronger colors, hover effects, micro-shadows)
3. ✅ Card/panel depth system (subtle shadows, border-opacity differentiation)
4. ✅ Orderbook depth bar gradient + spread % display
5. ✅ Grouping +/- buttons replacing dropdown
6. ✅ Last trade directional indicator + flash effect

### Phase B — Mobile UX (Impact: High, Effort: Medium) ✅ Complete

7. ✅ Sticky Buy/Sell buttons (fixed bottom, always visible)
8. ✅ Full-screen chart mode (mobile tap-to-expand)
9. ✅ Mobile orderbook level expansion (5 -> 8-10 levels)
10. ✅ Touch target 48px audit and fixes

### Phase C — Account Polish (Impact: Medium, Effort: Low) — 3/4 Complete

11. ⏳ Asset allocation donut chart on HomePage (deferred — AllocationDonut exists in Portfolio)
12. ✅ Token list 24h sparkline mini-charts (Binance 1h klines, SVG polyline)
13. ✅ Transfer History basic filters (token type, direction)
14. ✅ Deposit flow step-by-step guide improvement

### Phase D — Chart Enhancement (Impact: Medium, Effort: High) ✅ Complete

15. ✅ Additional indicators: VWAP (session reset) + Ichimoku Cloud (5-line + kumo fill via ISeriesPrimitive)
16. ✅ Extended timeframes: 1M (month) added to TimeInterval + INTERVAL_CONFIG
17. ✅ Chart-to-order: Desktop right-click + Mobile long-press (700ms) context menu → order form

---

## 7. Competitor Quick Reference

### Hyperliquid
- **Type**: DEX (on-chain CLOB), dark mode only, no native mobile
- **Strength**: Full on-chain orderbook, Scale/TWAP orders, gas-free trading, email wallet
- **Weakness**: Complex UI, poor mobile, dark mode only, panel customization unintuitive
- **Key Innovation**: Builder Code system (40% users trade through third-party frontends)

### Coinbase Advanced
- **Type**: CEX, dark + light mode, native mobile app
- **Strength**: 104 TradingView indicators, dual-mode UX (Simple/Advanced), best fiat integration
- **Weakness**: KYC friction, fee opacity, cannot edit bracket orders, slow support
- **Key Innovation**: Deepest TradingView integration in retail crypto

### Binance
- **Type**: CEX, dark + light mode, native mobile app
- **Strength**: OCO/Iceberg orders, AI-powered UI personalization, drag-drop panels, Lite/Pro modes
- **Weakness**: KYC rechecks, overwhelming pro mode, regional restrictions
- **Key Innovation**: "Binance UI Refined" — AI-recommended widget layout per user (91% positive)

### Lighter.xyz
- **Type**: DEX (CLOB with ZK proofs), dark mode only
- **Strength**: Zero trading fees, ZK-proof execution fairness, institutional-grade latency
- **Weakness**: Perp-focused (spot is secondary), limited educational content, newer platform
- **Key Innovation**: ZK-SNARK verified order matching — cannot be front-run by operator

### Cetus (Sui)
- **Type**: DEX (AMM, concentrated liquidity), largest Sui DEX by TVL
- **Strength**: Super Aggregator, DCA, limit orders, embeddable SDK
- **Weakness**: $220-260M exploit (May 2025), no orderbook, basic charting
- **Key Innovation**: Cetus Terminal (embeddable mini-DEX widget)

### Turbos Finance (Sui)
- **Type**: DEX (AMM + CLOB hybrid), Sui ecosystem
- **Strength**: Quick Trade Panel (mobile in-context trading), smart routing across AMM+CLOB
- **Weakness**: Limited advanced features, sparse documentation, smaller TVL
- **Key Innovation**: Meme coin optimized Quick Trading Panel

### BlueMove (Sui)
- **Type**: DEX (AMM) + NFT marketplace, Sui/Aptos dual-chain
- **Strength**: NFT + DEX super app concept
- **Weakness**: Most basic DEX in comparison — simple swaps only, no charts, no advanced orders
- **Key Innovation**: NFT marketplace integration alongside DEX

---

## 8. Industry Trends (2025-2026)

| Trend | Description | Pado Status |
|-------|-------------|-------------|
| **Walletless Onboarding** | Social login + embedded wallets, no seed phrases | ✅ Ahead (zkLogin + Passkey) |
| **AI Personalization** | AI-recommended layouts based on user behavior | Not implemented |
| **CLOB DEXs Rising** | Orderbook DEXs gaining share from AMMs for serious traders | ✅ Core architecture |
| **Mobile-First** | 60%+ crypto transactions on mobile | ✅ Improved (sticky buttons, long-press order, fullscreen chart) |
| **Sub-Second Confirmation** | Instant UI feedback before network confirmation | ⚠️ Partial (optimistic updates needed) |
| **Sticky Action Buttons** | Buy/Sell always visible on mobile | ✅ Implemented |
| **Progressive Disclosure** | Lite → Pro modes for different skill levels | ✅ Simple/Pro mode |
| **Transparent Fees** | Clear fee display before transaction | ✅ Implemented |

---

## Changelog

| Date | Change |
|------|--------|
| 2026-03-03 | Initial benchmark analysis: Pado vs Hyperliquid, Binance, Coinbase Advanced, Lighter, Cetus, Turbos, BlueMove |
| 2026-03-04 | Phase A (6/6) complete: visual polish, orderbook gradient, grouping buttons, trade flash |
| 2026-03-04 | Phase B (4/4) complete: sticky buttons, fullscreen chart, mobile orderbook, touch targets |
| 2026-03-05 | Phase C: C.12 sparkline, C.13 filters, C.14 deposit guide complete (C.11 donut deferred) |
| 2026-03-05 | Phase D (3/3) complete: VWAP+Ichimoku cloud fill, 1M timeframe, chart-to-order (desktop+mobile) |
| 2026-03-05 | Overall score updated: 81 → 85 (Chart 75→82, Mobile 72→80, Visual 73→80) |
