# Refactoring Proposal: Pado (Level 3 - High)

## 1. Project Overview
- **Path:** `apps/pado`
- **Current State:** Sophisticated DeFi app with complex state management, real-time data, and heavy charting logic.
- **Refactoring Goal:** Decouple business logic from UI, optimize performance (rendering), and modularize complex features like Charting and Trading.

---

## 2. Verification Results (Claude Review)

### Gemini Analysis Accuracy: 97/100

| Item | Gemini Analysis | Actual Status | Verdict |
|------|-----------------|---------------|---------|
| `PriceChart.tsx` | ~783 lines | **783 lines** | ✅ Accurate |
| `deepbook.ts` | ~683 lines | **683 lines** | ✅ Accurate |
| `useTrading.ts` | ~504 lines | **504 lines** | ✅ Accurate |
| `OutcomeOrderForm.tsx` | 398 lines | **398 lines** | ✅ Accurate |
| `CreateMarketForm.tsx` | 298 lines | **298 lines** | ✅ Accurate |
| Trading modularization | Needs work | ✅ **Already excellent** | See below |

### Key Finding: Trading Module Already Well-Modularized

**Trading feature is already split into 11 components + 5 hooks:**

```
features/trading/
├── components/ (11 files)
│   ├── OrderForm.tsx         (284 lines)
│   ├── PriceChart.tsx        (783 lines) ⚠️ Large
│   ├── Orderbook.tsx         (158 lines)
│   ├── OrderConfirmModal.tsx (131 lines)
│   ├── MarketSelector.tsx    (124 lines)
│   ├── BalanceManagerCard.tsx (78 lines)
│   ├── PriceSuggestions.tsx  (99 lines)
│   ├── SlippageSettings.tsx  (91 lines)
│   ├── TradeHistory.tsx      (99 lines)
│   ├── OpenOrders.tsx        (49 lines)
│   └── PoolInfo.tsx          (28 lines)
├── hooks/ (5 files)
│   ├── useFaucet.ts          (114 lines)
│   ├── useOpenOrders.ts      (49 lines)
│   ├── useOrderActions.ts    (244 lines) ✅ Already split
│   ├── useOrderbook.ts       (59 lines)
│   └── useTradeEvents.ts     (152 lines) ✅ Already split
├── context/
│   ├── MarketContext.tsx     (100 lines)
│   └── OrderFormContext.tsx
├── useTrading.ts             (504 lines)
├── transactions.ts
├── types.ts
├── constants.ts
└── utils/errorParser.ts
```

**Prediction Module Exists:**
```
features/prediction/
├── components/
│   ├── AdminResolveModal.tsx  (140 lines)
│   ├── CreateMarketForm.tsx   (298 lines) ⚠️ Large
│   ├── MarketCard.tsx         (124 lines)
│   ├── MarketHeader.tsx       (156 lines)
│   ├── OutcomeOrderForm.tsx   (398 lines) ⚠️ Large
│   ├── OutcomeOrderbook.tsx   (276 lines)
│   └── PositionList.tsx       (293 lines)
├── hooks/
├── lib/
├── types.ts
└── constants.ts
```

---

## 3. Key Issues & Analysis

### A. PriceChart.tsx (783 lines) ⚠️ Moderate Issue
- **Problem:** Contains indicator calculation functions inline:
  - `calculateMA()` (lines 36-51)
  - `calculateEMA()` (lines 54-62)
  - `calculateRSI()` (lines 65-92)
  - `calculateMACD()` (lines 95-125)
  - `generateCandleData()` (lines 128-153)
  - `generateVolumeData()` (lines 156-162)
- **Risk:** Hard to unit test indicators; duplicated if needed elsewhere

### B. useTrading.ts (504 lines) ⚠️ Acceptable
- **Actual Status:** Many responsibilities already extracted:
  - `useOrderActions.ts` (244 lines) - Order actions
  - `useTradeEvents.ts` (152 lines) - Trade events
  - `useOrderbook.ts` (59 lines) - Orderbook data
- **Remaining:** Balance management, local storage, core coordination
- **Verdict:** Acceptable size for a coordination hook

### C. Prediction Components ⚠️ Real Issue
- `OutcomeOrderForm.tsx` (398 lines) - Form + validation + UI mixed
- `CreateMarketForm.tsx` (298 lines) - Form + validation + UI mixed
- `PositionList.tsx` (293 lines) - List + actions + modals mixed

### D. deepbook.ts (683 lines) ✅ Well Structured
- **Actual Structure:**
  - Type definitions (lines 14-37)
  - `getOrderbook()` function (lines 44-103)
  - Helper functions (lines 109-214): parsing, formatting, conversion
  - Swap transaction builder (lines 219+)
- **Verdict:** Already organized by concern, no immediate action needed

---

## 4. Revised Refactoring Plan

### Phase 1: Technical Indicators Library ⏱️ 2 hours
**Priority: HIGH** (improves testability)

1. **Create `src/lib/indicators/`:**
   ```
   src/lib/indicators/
   ├── index.ts           # Barrel export
   ├── movingAverage.ts   # MA, EMA calculations
   ├── rsi.ts             # RSI calculation
   ├── macd.ts            # MACD calculation
   └── types.ts           # Indicator types
   ```

2. **Update PriceChart.tsx:**
   - Import indicators from library
   - Remove inline calculation functions
   - Expected reduction: 783 lines → 650 lines

### Phase 2: Prediction Form Decomposition ⏱️ 3 hours
**Priority: MEDIUM**

1. **Refactor OutcomeOrderForm.tsx (398 → 200 lines):**
   ```
   components/prediction/OutcomeOrderForm/
   ├── index.tsx              # Main component
   ├── OutcomeSelector.tsx    # YES/NO selector
   ├── OrderTypeSelector.tsx  # Buy/Sell tabs
   ├── AmountInput.tsx        # Amount + price inputs
   ├── OrderSummary.tsx       # Estimated payout display
   └── useOutcomeOrder.ts     # Form logic hook
   ```

2. **Refactor CreateMarketForm.tsx (298 → 150 lines):**
   ```
   components/prediction/CreateMarketForm/
   ├── index.tsx              # Main component
   ├── MarketDetails.tsx      # Title, description, category
   ├── ResolutionSettings.tsx # End date, resolution
   └── useCreateMarket.ts     # Form logic hook
   ```

### Phase 3: Optional Cleanup ⏱️ 1 hour
**Priority: LOW**

1. **Extract shared form components:**
   - `FormInput.tsx` - Styled input with label
   - `FormSelect.tsx` - Styled select with options
   - `FormSection.tsx` - Section container

---

## 5. Expected Outcome

| Metric | Before | After |
|--------|--------|-------|
| `PriceChart.tsx` | 783 lines | ~650 lines |
| `OutcomeOrderForm.tsx` | 398 lines | ~200 lines |
| `CreateMarketForm.tsx` | 298 lines | ~150 lines |
| New reusable files | 0 | 8-10 |
| Technical indicator tests | 0 | Possible |

### Benefits
- Improved rendering performance for PriceChart
- Reusable indicator library for future charts
- Easier unit testing for prediction form logic
- Clearer separation between form logic and UI

---

## 6. Estimated Effort

| Phase | Time | Priority |
|-------|------|----------|
| Phase 1: Indicators Library | 2 hours | High |
| Phase 2: Prediction Forms | 3 hours | Medium |
| Phase 3: Shared Form Components | 1 hour | Low |
| **Total** | **6-8 hours** | - |

---

## 7. Files to Modify

```
apps/pado/frontend/src/
├── lib/
│   └── indicators/           # NEW: Technical indicator library
│       ├── index.ts
│       ├── movingAverage.ts
│       ├── rsi.ts
│       ├── macd.ts
│       └── types.ts
├── features/
│   ├── trading/
│   │   └── components/
│   │       └── PriceChart.tsx    # MODIFY: Import indicators
│   └── prediction/
│       └── components/
│           ├── OutcomeOrderForm/  # NEW: Folder structure
│           │   ├── index.tsx
│           │   ├── OutcomeSelector.tsx
│           │   └── useOutcomeOrder.ts
│           ├── CreateMarketForm/  # NEW: Folder structure
│           │   ├── index.tsx
│           │   └── useCreateMarket.ts
│           ├── OutcomeOrderForm.tsx  # DELETE: Original
│           └── CreateMarketForm.tsx  # DELETE: Original
└── components/
    └── form/                 # NEW: Shared form components
        ├── FormInput.tsx
        ├── FormSelect.tsx
        └── FormSection.tsx
```

---

## 8. Notes

### Already Excellent (No Action Needed)
- Trading hooks separation (useOrderActions, useTradeEvents, etc.)
- Trading component granularity (11 focused components)
- DeepBook library organization
- Context separation (MarketContext, OrderFormContext)

### Architecture Observations
- Pado follows feature-based architecture well
- Trading module is a good example of proper modularization
- Prediction module needs same level of refinement
