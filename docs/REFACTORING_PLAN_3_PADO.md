# Refactoring Proposal: Pado (Level 3 - High)

## 1. Project Overview
- **Path:** `apps/pado`
- **Current State:** sophisticated DeFi app with complex state management, real-time data, and heavy charting logic.
- **Refactoring Goal:** Decouple business logic from UI, optimize performance (rendering), and modularize complex features like Charting and Trading.

## 2. Key Issues & Analysis

### A. Massive Chart Component
- **File:** `src/features/trading/components/PriceChart.tsx` (~783 lines)
- **Problem:** Handles canvas drawing, data fetching, websocket updates, indicators, and user interactions.
- **Risk:** Performance bottlenecks; extremely hard to debug or change charting library.

### B. Core Logic Complexity
- **File:** `src/lib/deepbook.ts` (~683 lines)
- **Problem:** Massive file handling DeepBook V3 interaction. Likely mixes API calls with transaction building.
- **File:** `src/features/trading/useTrading.ts` (~504 lines)
- **Problem:** "God Hook" that manages too much state (orders, balances, UI state).

### C. Prediction Market Logic
- **Files:** `OutcomeOrderForm.tsx` (398 lines), `CreateMarketForm.tsx` (298 lines).
- **Problem:** Form logic mixed with UI rendering and validation.

## 3. Refactoring Plan

### Phase 1: Charting Modularization
1. **Extract Sub-components for `PriceChart`**
   - `ChartHeader.tsx` (Controls, Timeframe selector)
   - `ChartCanvas.tsx` (Pure rendering component)
   - `useChartData.ts` (Hook for data fetching/websocket)
   - `useChartIndicators.ts` (Logic for MA, EMA, etc.)

### Phase 2: "God Hook" Decomposition
1. **Split `useTrading.ts`**
   - `useOrderManagement.ts` (Place, Cancel, Modify orders)
   - `useAccountBalance.ts` (Balance sync)
   - `useMarketData.ts` (Orderbook, recent trades)

### Phase 3: DeepBook SDK Wrapper
1. **Refactor `deepbook.ts`**
   - Create a class-based service or split into modules:
     - `src/services/deepbook/order.ts` (Transaction builders)
     - `src/services/deepbook/query.ts` (Read-only calls)
     - `src/services/deepbook/types.ts`

## 4. Expected Outcome
- Improved rendering performance for the Price Chart.
- Easier unit testing for critical trading logic (Order placement).
- Clearer separation between Data Layer (DeepBook) and UI Layer.
