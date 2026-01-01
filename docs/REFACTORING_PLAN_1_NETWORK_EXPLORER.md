# Refactoring Proposal: Network Explorer (Level 1 - Easy)

## 1. Project Overview
- **Path:** `apps/network-explorer`
- **Current State:** Simple structure, clean, but showing signs of growing monolithic page components.
- **Refactoring Goal:** Establish a solid foundation for scaling by separating logic (hooks), utilities, and UI components.

## 2. Key Issues & Analysis

### A. Monolithic Page Components
- **File:** `src/pages/Home.tsx` (~400 lines)
- **Problem:** Contains API data fetching (`useQuery`), state management (TPS history), data formatting helpers, and complex UI (Charts) all in one file.
- **Risk:** Hard to test individual parts; harder to reuse TPS logic or Chart components.

### B. Inline Utility Functions
- **Problem:** Functions like `formatTimestamp`, `truncateDigest`, `formatDuration` are defined inside `Home.tsx` and likely duplicated in `Transaction.tsx` or `Object.tsx`.

### C. Large API Client
- **File:** `src/lib/sui-client.ts` (~326 lines)
- **Problem:** Mixes RPC calls, type definitions, and possibly data transformation.

## 3. Refactoring Plan

### Phase 1: Utility Extraction (Immediate)
1. **Create `src/utils/format.ts`**
   - Move `formatTimestamp`, `truncateDigest`, `formatDuration`, `formatLastUpdated` here.
   - Update all pages to import from this utility.

### Phase 2: Custom Hooks Extraction
1. **Create `src/hooks/useNetworkData.ts`**
   - Extract `useQuery` for `networkStatus`, `recentTransactions`, `tps`.
   - Move `TPSDataPoint` interface here or to `src/types`.
   - Encapsulate the "TPS History" accumulation logic (`useEffect` + `useState`) into a custom hook `useTPSHistory()`.

### Phase 3: Component Atomization
1. **Extract Chart Components**
   - Create `src/components/charts/TPSChart.tsx`.
   - Move `AreaChart` and `Recharts` logic there.
2. **Extract Tables**
   - Create `src/components/tables/RecentTxTable.tsx`.
   - Move the transaction list rendering logic out of `Home.tsx`.

## 4. Expected Outcome
- `Home.tsx` reduced to < 100 lines (only layout composition).
- Reusable "TPS Chart" and "Transaction Table" for other pages.
- Centralized formatting logic ensuring consistency across the app.
