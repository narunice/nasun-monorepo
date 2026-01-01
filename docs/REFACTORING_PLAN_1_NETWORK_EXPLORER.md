# Refactoring Proposal: Network Explorer (Level 1 - Easy)

## 1. Project Overview
- **Path:** `apps/network-explorer`
- **Current State:** Simple structure, clean, but showing signs of growing monolithic page components.
- **Refactoring Goal:** Establish a solid foundation for scaling by separating logic (hooks), utilities, and UI components.

---

## 2. Verification Results (Claude Review)

### Gemini Analysis Accuracy: 85/100

| Item | Gemini Analysis | Actual Status | Verdict |
|------|-----------------|---------------|---------|
| `Home.tsx` line count | ~400 lines | **394 lines** | ✅ Accurate |
| `sui-client.ts` line count | ~326 lines | **326 lines** | ✅ Accurate |
| Utility functions duplication | Likely duplicated | ⚠️ Partially addressed | See below |
| Need for `src/utils/format.ts` | Create new | ✅ **Already exists** as `lib/format.ts` | ❌ Incorrect |

### Key Finding
**`lib/format.ts` already exists (61 lines)** with the following utilities:
- `formatCoinType()` - Native token formatting
- `formatObjectType()` - Object type formatting
- `formatBalance()` - Balance formatting (SOE → NASUN)
- `formatSoe()` - SOE unit formatting
- `truncateType()` - Type string truncation

**Local utilities in Home.tsx** (still need extraction):
- `formatTimestamp()` (lines 17-21)
- `truncateDigest()` (lines 23-25)
- `formatLastUpdated()` (lines 27-30)
- `formatDuration()` (lines 32-38)

---

## 3. Key Issues & Analysis

### A. Monolithic Page Components
- **File:** `src/pages/Home.tsx` (394 lines)
- **Problem:** Contains API data fetching (`useQuery`), state management (TPS history), data formatting helpers, and complex UI (Charts) all in one file.
- **Risk:** Hard to test individual parts; harder to reuse TPS logic or Chart components.

### B. Inline Utility Functions ⚠️ Partially Resolved
- **Status:** Core formatting exists in `lib/format.ts`
- **Remaining:** Time/duration formatters still inline in `Home.tsx`

### C. Large API Client ✅ Well Structured
- **File:** `src/lib/sui-client.ts` (326 lines)
- **Actual State:** Already well-organized with clear section comments:
  - Network Status Functions (lines 13-36)
  - Transaction Functions (lines 38-133)
  - Validator Functions (lines 139-195)
  - Checkpoint Functions (lines 201-225)
  - Coin Metadata Functions (lines 231-239)
  - Epoch & TPS Functions (lines 245-297)
  - Package/Module Functions (lines 303-327)
- **Verdict:** No immediate refactoring needed

---

## 4. Revised Refactoring Plan

### Phase 1: Complete Utility Extraction ⏱️ 1 hour
**Status:** Partially done, complete the remaining

1. **Add to `src/lib/format.ts`:**
   ```typescript
   // Time formatting utilities
   export function formatTimestamp(timestamp: string | number): string
   export function formatDuration(ms: number): string
   export function formatLastUpdated(date: Date): string
   export function truncateDigest(digest: string, length?: number): string
   ```

2. **Update `Home.tsx` imports:**
   - Remove inline function definitions
   - Import from `lib/format.ts`

### Phase 2: Custom Hooks Extraction ⏱️ 1-2 hours
1. **Create `src/hooks/useNetworkData.ts`:**
   - Extract `useQuery` for `networkStatus`, `recentTransactions`, `tps`
   - Move `TPSDataPoint` interface to `src/types/network.ts`

2. **Create `src/hooks/useTPSHistory.ts`:**
   - Encapsulate TPS history accumulation logic
   - Move `useState` + `useEffect` pattern

### Phase 3: Component Atomization ⏱️ 1 hour
1. **Create `src/components/charts/TPSChart.tsx`:**
   - Move `AreaChart` and Recharts configuration
   - Accept `data` prop with `TPSDataPoint[]`

2. **Optional: Create `src/components/tables/RecentTxTable.tsx`:**
   - Move transaction list rendering
   - Accept `transactions` prop

---

## 5. Expected Outcome

| Metric | Before | After |
|--------|--------|-------|
| `Home.tsx` lines | 394 | ~100 |
| `lib/format.ts` lines | 61 | ~100 |
| New files created | 0 | 2-3 |
| Reusable components | 0 | 2 |

### Benefits
- `Home.tsx` reduced to layout composition only
- Reusable "TPS Chart" for future pages
- Centralized time formatting logic
- Easier unit testing for data hooks

---

## 6. Estimated Effort

| Phase | Time | Priority |
|-------|------|----------|
| Phase 1: Utility Extraction | 1 hour | High |
| Phase 2: Hooks Extraction | 1-2 hours | Medium |
| Phase 3: Component Atomization | 1 hour | Low |
| **Total** | **2-3 hours** | - |

---

## 7. Files to Modify

```
apps/network-explorer/src/
├── lib/
│   └── format.ts          # Add time formatting functions
├── hooks/
│   ├── useNetworkData.ts  # NEW: Network data queries
│   └── useTPSHistory.ts   # NEW: TPS history state
├── components/
│   └── charts/
│       └── TPSChart.tsx   # NEW: Recharts wrapper
├── types/
│   └── network.ts         # NEW: TPSDataPoint interface
└── pages/
    └── Home.tsx           # MODIFY: Remove inline code
```
