# Pado Trade UI Benchmark Improvement Plan

## Executive Summary

파도 앱의 트레이드 화면 UI를 Lighter, Asterdex, Hyperliquid의 공통 UI 패턴과 비교 분석하여 벤치마킹 개선안을 도출합니다.

---

## 1. Current State Analysis (파도 앱 현황)

### 1.1 Layout Structure
- **Simple/Pro Mode Toggle**: 초보자/전문가 분리 (Asterdex와 유사)
- **Grid Layout**: 1-2-3 column responsive
- **Components**: BalancePanel, MarketPanel (Chart + Orderbook), TradingPanel

### 1.2 Existing Features
| Feature | Status | Notes |
|---------|--------|-------|
| Limit/Market Orders | ✅ | GTC, IOC, FOK, POST_ONLY |
| Orderbook | ✅ | Depth 5/10/20, Click-to-fill |
| Chart | ✅ | lightweight-charts (MA, RSI, MACD) |
| Leverage Slider | ✅ | 1-20x (Perp only) |
| Liquidation Warning | ✅ | 4-tier risk system |
| Dark/Light Theme | ✅ | CSS variables |
| Mobile Responsive | ✅ | Simple mode for mobile |

### 1.3 Current Gaps (벤치마킹 대상 거래소 대비)
1. Market Info Bar가 제한적 (Mid Price만 표시)
2. Orderbook에 Total(누적), Spread, Heatmap 없음
3. TP/SL (Take Profit/Stop Loss) 미지원
4. One-Click Trading 미지원
5. 하단 탭 기반 Position/Orders 관리 미구현
6. Cross/Isolated 마진 모드 선택 없음

---

## 2. Benchmark Analysis (3개 거래소 공통 패턴)

### 2.1 Market Info Bar (상단 정보 바)
**공통 패턴**: 모든 거래소가 차트 위에 핵심 마켓 정보를 한 줄로 표시

| Element | Lighter | Asterdex | Hyperliquid |
|---------|---------|----------|-------------|
| Current Price | ✅ | ✅ | ✅ |
| 24h Change (%) | ✅ | ✅ | ✅ |
| 24h Volume | ✅ | ✅ | ✅ |
| Mark/Index Price | - | ✅ | - |
| Funding Rate | - | ✅ (Countdown) | ✅ |
| Open Interest | - | ✅ | - |
| Market Cap | - | - | ✅ |

**UX Rationale**: 트레이더가 별도 탐색 없이 핵심 정보를 한눈에 파악

### 2.2 Orderbook Design
**공통 패턴**: 3-column layout (Price, Size, Total)

| Element | Lighter | Asterdex | Hyperliquid |
|---------|---------|----------|-------------|
| Price Column | ✅ | ✅ | ✅ |
| Size Column | ✅ | ✅ | ✅ |
| Total (Cumulative) | ✅ | ✅ | ✅ |
| Spread Display | ✅ | ✅ | ✅ |
| Depth Heatmap | - | ✅ | ✅ |
| Click-to-fill | ✅ | ✅ | ✅ |

**UX Rationale**: Total 컬럼으로 유동성 깊이를 즉시 파악

### 2.3 Order Entry Panel
**공통 패턴**: Tab-based (Market/Limit/Advanced)

| Element | Lighter | Asterdex | Hyperliquid |
|---------|---------|----------|-------------|
| Market/Limit Tabs | ✅ | ✅ | ✅ |
| TP/SL Settings | - | ✅ | ✅ |
| Leverage Slider | - | ✅ | ✅ |
| Cross/Isolated Mode | - | ✅ | ✅ |
| Post-Only/Reduce-Only | ✅ | ✅ | ✅ |
| Hidden Order | - | ✅ | - |
| One-Click Trading | - | - | ✅ |

### 2.4 Position Management
**공통 패턴**: 하단 탭 기반 레이아웃

| Tab | Lighter | Asterdex | Hyperliquid |
|-----|---------|----------|-------------|
| Positions | ✅ | ✅ | ✅ |
| Open Orders | ✅ | ✅ | ✅ |
| Order History | ✅ | ✅ | ✅ |
| Trade History | ✅ | ✅ | ✅ |
| Assets/Balances | ✅ | ✅ | ✅ |

---

## 3. Improvement Recommendations

### Priority 1: High Impact, Low Effort

#### 3.1 Enhanced Market Info Bar
**Current**: Mid Price만 표시
**Improvement**: 차트 상단에 핵심 마켓 정보 바 추가

```
┌────────────────────────────────────────────────────────────┐
│ NBTC/NUSDC  $95,000.50  ▲+2.34%  Vol: $1.2M  OI: $500K    │
│             [Price]     [24h]     [24h]     [Funding: +0.01%]
└────────────────────────────────────────────────────────────┘
```

**Files to modify**:
- `apps/pado/frontend/src/features/trading/containers/MarketPanel.tsx`
- New: `MarketInfoBar.tsx`

**Effort**: Low (2-3 hours)
**Impact**: High (즉각적인 정보 접근성 향상)

#### 3.2 Orderbook Total Column
**Current**: Price, Amount만 표시
**Improvement**: Total (누적) 컬럼 추가 + Spread 표시

```
┌─────────────────────────────────────────┐
│ Price      Size       Total             │
├─────────────────────────────────────────┤
│ $95,010    0.0150     0.0150   ▓████    │
│ $95,020    0.0100     0.0250   ▓███     │
│ $95,030    0.0200     0.0450   ▓██      │
│            Spread: 0.012% ($10)         │
│ $94,990    0.0120     0.0120   ▓████    │
│ $94,980    0.0200     0.0320   ▓███     │
└─────────────────────────────────────────┘
```

**Files to modify**:
- `apps/pado/frontend/src/features/trading/components/Orderbook.tsx`

**Effort**: Low (2-3 hours)
**Impact**: High (유동성 분석 용이)

#### 3.3 Bottom Tab Panel for Position/Orders
**Current**: TradingPanel 내 inline OpenOrders
**Improvement**: 하단 탭 기반 패널 분리

```
┌─ Tabs ─────────────────────────────────────────────────────┐
│ [Positions] [Open Orders (5)] [Order History] [Assets]     │
├────────────────────────────────────────────────────────────┤
│ Position content / Order list / History / Balance          │
└────────────────────────────────────────────────────────────┘
```

**Files to modify**:
- `apps/pado/frontend/src/pages/TradePage.tsx`
- New: `BottomTabPanel.tsx`, `OrderHistory.tsx`

**Effort**: Medium (4-6 hours)
**Impact**: High (전문 트레이더 UX 대폭 향상)

### Priority 2: Medium Impact, Medium Effort

#### 3.4 TP/SL (Take Profit / Stop Loss) Settings
**Current**: 미지원
**Improvement**: Perp 주문 시 TP/SL 설정 옵션

```
┌─ TP/SL Settings ──────────────────────┐
│ ☑ Take Profit                         │
│   Price: [$96,000] (+2.5%)            │
│ ☑ Stop Loss                           │
│   Price: [$94,000] (-1.0%)            │
└───────────────────────────────────────┘
```

**Files to modify**:
- `apps/pado/frontend/src/features/perp/components/PerpOrderForm.tsx`
- New: `TpSlSettings.tsx`
- Backend: Conditional order logic 필요

**Effort**: Medium-High (TP/SL 로직 구현 필요)
**Impact**: Medium (리스크 관리 필수 기능)

#### 3.5 Cross/Isolated Margin Mode Toggle
**Current**: Isolated만 지원 (암묵적)
**Improvement**: 명시적 모드 선택 UI

```
┌─ Margin Mode ─────────────────────────┐
│ [Cross] [Isolated*]                    │
│                                        │
│ Isolated: Each position has separate   │
│ margin. Liquidation affects only this  │
│ position.                              │
└────────────────────────────────────────┘
```

**Files to modify**:
- `apps/pado/frontend/src/features/perp/components/PerpOrderForm.tsx`
- New: `MarginModeSelector.tsx`

**Effort**: Medium (UI만 우선, 백엔드 Cross 지원은 후속)
**Impact**: Medium (전문 트레이더 기대 기능)

### Priority 3: Nice-to-Have

#### 3.6 One-Click Trading (Hyperliquid 스타일)
**Current**: 미지원
**Improvement**: Pro 모드에서 원클릭 체결 옵션

```
┌─ Quick Trade ─────────────────────────┐
│ ☑ One-Click Trading (Skip confirmation)│
│                                        │
│ ⚠ Orders execute immediately without  │
│   confirmation. Use with caution.      │
└────────────────────────────────────────┘
```

**Files to modify**:
- `apps/pado/frontend/src/features/trading/context/OrderFormContext.tsx`
- Confirm modal 스킵 로직

**Effort**: Low
**Impact**: Low-Medium (속도 중시 트레이더)

#### 3.7 Depth Heatmap Visualization
**Current**: 단순 퍼센트 바
**Improvement**: 오더북 히트맵 (농도별 색상)

**Effort**: Medium
**Impact**: Low (시각적 향상)

#### 3.8 Hidden/Iceberg Orders (Asterdex 스타일)
**Current**: 미지원
**Improvement**: 대량 주문 노출 방지

**Effort**: High (백엔드 지원 필요)
**Impact**: Low (기관 트레이더 타겟)

---

## 4. Implementation Roadmap

**Scope**: Phase 1-3 전체 구현
**Priority**: Spot DEX 우선, Perp는 후속

### Phase 1: Quick Wins - Spot DEX (Completed)
1. [x] Market Info Bar 추가 (Spot) - `MarketInfoBar.tsx`
2. [x] Orderbook Total 컬럼 + Spread 표시 - `Orderbook.tsx`

### Phase 2: Core Improvements - Spot DEX (Completed)
3. [x] Bottom Tab Panel - `BottomTabPanel.tsx`
4. [x] One-Click Trading 옵션 - `OrderFormContext.tsx`, `TradingPanel.tsx`

### Phase 2.5: Layout & Visual Overhaul (Completed)
5. [x] **Pro 모드 레이아웃 재구성** - 차트+오더북 수평 배치 (4-column grid)
6. [x] **오더북 세로형 전환** - Asks(위) + Spread(중앙) + Bids(아래)
7. [x] **폰트 사이즈 최적화** - compact typography (10-12px) via Tailwind `text-trading-*`
8. [x] **색상 톤다운** - subtle 빨강/초록, 제한된 액센트 via CSS variables

### Phase 2.6: UI Cleanup - Faucet Removal (Completed)
9. [x] **Faucet 버튼 전면 제거** - 메인넷 준비를 위한 테스트넷 전용 UI 정리
   - BalancePanel: NASUN/NBTC/NUSDC 3개 버튼 제거
   - TradingBalanceBar: +NBTC, +NUSDC 인라인 버튼 제거
   - InsufficientBalancePrompt: onFaucet prop 및 버튼 제거
   - DepositForm: "Get NUSDC" 버튼 제거
   - StakingSection: "Get NASUN" 버튼 제거
10. [x] **에러 메시지 개선** - "faucet" 참조를 "wallet"으로 변경
   - Gas 부족: "Get NASUN from your wallet"
   - 잔액 부족: "Add funds from your wallet"

### Phase 3: Advanced Features - Perp DEX
11. [ ] TP/SL Settings (Perp 주문 시)
12. [ ] Cross/Isolated Mode UI (Perp)
13. [ ] Market Info Bar 확장 (Funding Rate, OI)

### Phase 4: Polish (후속 - 선택사항)
14. ⏳ Depth Heatmap
15. ⏳ Hidden Orders

---

## 4.5 Phase 2.5 Detail Specifications

### 4.5.1 Pro Mode Layout Target
```
┌─────────────────────────────────────────────────────────┐
│ [Market Info Bar]                                        │
├───────────────────────────────┬─────────────┬───────────┤
│        [Chart]                │ [Orderbook] │ [Order    │
│        (lg:col-span-2)        │ (세로형)    │  Form]    │
├───────────────────────────────┴─────────────┴───────────┤
│ [Bottom Tab Panel: Positions | Open Orders | History]   │
└─────────────────────────────────────────────────────────┘
```

### 4.5.2 Vertical Orderbook
```
┌─────────────────────────────┐
│ Price    Size    Total      │
├─────────────────────────────┤
│ 95,030   0.015   0.045  ▓▓  │ ← Asks (red)
│ 95,010   0.020   0.020  ▓▓▓▓│ ← Best Ask
├─────────────────────────────┤
│     95,005.00  Spread 0.01% │ ← Mid Price
├─────────────────────────────┤
│ 95,000   0.025   0.025  ▓▓▓▓│ ← Best Bid
│ 94,980   0.010   0.050  ▓▓  │ ← Bids (green)
└─────────────────────────────┘
```

### 4.5.3 Typography Scale (Compact)
| Element | Size |
|---------|------|
| Orderbook rows | 11px |
| Info bar labels | 10-11px |
| Form labels | 12px |
| Form inputs | 13px |
| Current price | 18px |

### 4.5.4 Color Palette (Subtle)
```css
/* Muted Trading Colors */
--color-bid: #16a34a;
--color-bid-bg: rgba(22, 163, 74, 0.08);
--color-ask: #dc2626;
--color-ask-bg: rgba(220, 38, 38, 0.08);

/* Darker Background */
--color-bg-primary: #0a0a0a;
--color-bg-secondary: #141414;

/* Muted Text */
--color-text-primary: #e5e5e5;
--color-text-muted: #737373;
```

---

## 5. Design Specifications

### 5.1 Market Info Bar Component
```tsx
// MarketInfoBar.tsx
interface MarketInfoBarProps {
  symbol: string;           // "NBTC/NUSDC"
  price: number;            // 95000.50
  priceChange24h: number;   // 2.34 (%)
  volume24h: number;        // 1200000 (USD)
  openInterest?: number;    // 500000 (USD)
  fundingRate?: number;     // 0.01 (%)
  nextFunding?: Date;       // countdown
}
```

**Color Coding**:
- Price Up: `text-green-400`
- Price Down: `text-red-400`
- Neutral: `text-theme-text-secondary`

### 5.2 Enhanced Orderbook
```tsx
// Orderbook.tsx - Enhanced columns
interface OrderbookRow {
  price: number;
  size: number;
  total: number;      // NEW: cumulative size
  percentage: number; // NEW: % of total liquidity
}

// Spread calculation
const spread = bestAsk - bestBid;
const spreadPercent = (spread / midPrice) * 100;
```

### 5.3 Bottom Tab Panel
```tsx
// BottomTabPanel.tsx
type TabType = 'positions' | 'openOrders' | 'orderHistory' | 'tradeHistory' | 'assets';

interface BottomTabPanelProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  positionCount: number;
  openOrderCount: number;
}
```

---

## 6. Files to Create/Modify

### New Files
1. `apps/pado/frontend/src/features/trading/components/MarketInfoBar.tsx`
2. `apps/pado/frontend/src/features/trading/components/BottomTabPanel.tsx`
3. `apps/pado/frontend/src/features/trading/components/OrderHistory.tsx`
4. `apps/pado/frontend/src/features/trading/components/TradeHistoryTab.tsx`
5. `apps/pado/frontend/src/features/perp/components/TpSlSettings.tsx`
6. `apps/pado/frontend/src/features/perp/components/MarginModeSelector.tsx`

### Modified Files
1. `apps/pado/frontend/src/pages/TradePage.tsx` - Layout restructure
2. `apps/pado/frontend/src/features/trading/containers/MarketPanel.tsx` - Add MarketInfoBar
3. `apps/pado/frontend/src/features/trading/components/Orderbook.tsx` - Total column, Spread
4. `apps/pado/frontend/src/features/trading/context/OrderFormContext.tsx` - One-click option
5. `apps/pado/frontend/src/features/perp/components/PerpOrderForm.tsx` - TP/SL, Margin mode

---

## 7. Verification Plan

### 7.1 Visual Verification
1. Desktop (1920x1080): 3-column Pro layout 확인
2. Tablet (768px): 2-column layout 확인
3. Mobile (375px): Simple mode fallback 확인

### 7.2 Functional Testing
1. Market Info Bar: 실시간 가격 업데이트 확인
2. Orderbook: Total 계산 정확성, Spread 표시
3. Bottom Tabs: 탭 전환, 데이터 로드
4. One-Click: 확인 모달 스킵 동작

### 7.3 Performance
1. Orderbook 렌더링: 60fps 유지 (20 levels)
2. Tab 전환: < 100ms

---

## 8. Summary

| Priority | Item | Effort | Impact | Phase | Status |
|----------|------|--------|--------|-------|--------|
| P1 | Market Info Bar | Low | High | 1 | ✅ |
| P1 | Orderbook Total + Spread | Low | High | 1 | ✅ |
| P1 | Bottom Tab Panel | Medium | High | 2 | ✅ |
| P2 | One-Click Trading | Low | Medium | 2 | ✅ |
| P1 | Faucet UI Removal | Low | High | 2.6 | ✅ |
| P1 | Error Message Improvement | Low | Medium | 2.6 | ✅ |
| P2 | TP/SL Settings | Medium-High | Medium | 3 | - |
| P2 | Cross/Isolated Mode | Medium | Medium | 3 | - |
| P3 | Depth Heatmap | Medium | Low | 4 | - |
| P3 | Hidden Orders | High | Low | 4 | - |

**Confirmed Approach**:
- Phase 1-2.6 완료 (Spot DEX 개선 + UI 정리)
- Phase 3 (Perp DEX) 진행 예정
- Phase 4 (Heatmap, Hidden Orders)는 후속 검토
