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

## 4. Refactoring Plan ✅ COMPLETED (2026-01-01)

### Phase 1: Complete Utility Extraction ✅ Done
1. **Added to `src/lib/format.ts`:**
   - `formatTimestamp()` - Format timestamp to localized date string
   - `formatDuration()` - Format milliseconds to human-readable string
   - `formatLastUpdated()` - Format date to time-only string
   - `truncateDigest()` - Truncate transaction digest for display

### Phase 2: Custom Hooks Extraction ✅ Done
1. **Created `src/hooks/types.ts`:**
   - `TPSDataPoint` interface
   - `MAX_TPS_HISTORY` constant

2. **Created `src/hooks/useNetworkData.ts`:**
   - `useNetworkStatus()` - Network status query
   - `useEpochInfo()` - Epoch information query
   - `useTPS()` - TPS query
   - `useRecentTransactions()` - Recent transactions query

3. **Created `src/hooks/useTPSHistory.ts`:**
   - Encapsulates TPS history accumulation logic
   - Auto-updates when new TPS data arrives

### Phase 3: Component Atomization ✅ Done
1. **Created `src/components/charts/TPSChart.tsx`:**
   - Reusable TPS trend chart with Recharts
   - Accepts `data: TPSDataPoint[]` prop

2. **Created `src/components/charts/EpochProgress.tsx`:**
   - Epoch progress bar with timestamps
   - Displays remaining time

3. **Created `src/components/charts/SearchBar.tsx`:**
   - Search functionality for tx/object/address
   - Auto-detects input type

---

## 5. Results

| Metric | Before | After | Status |
|--------|--------|-------|--------|
| `Home.tsx` lines | 394 | **174** | ✅ 56% reduction |
| `lib/format.ts` lines | 61 | **92** | ✅ Time utils added |
| New hooks created | 0 | **4** | ✅ Done |
| New components created | 0 | **3** | ✅ Done |

### Benefits Achieved
- `Home.tsx` reduced to layout composition only
- Reusable "TPS Chart" and "Epoch Progress" components
- Centralized time formatting logic in `lib/format.ts`
- Custom hooks for easier testing and reuse

---

## 6. Final Effort

| Phase | Time | Status |
|-------|------|--------|
| Phase 1: Utility Extraction | 15 min | ✅ Done |
| Phase 2: Hooks Extraction | 30 min | ✅ Done |
| Phase 3: Component Atomization | 30 min | ✅ Done |
| **Total** | **~1.5 hours** | ✅ Complete |

---

## 7. Final File Structure

```
apps/network-explorer/src/
├── lib/
│   └── format.ts              # ✅ UPDATED: +31 lines (time formatting)
├── hooks/
│   ├── index.ts               # ✅ NEW: Barrel export
│   ├── types.ts               # ✅ NEW: TPSDataPoint, MAX_TPS_HISTORY
│   ├── useNetworkData.ts      # ✅ NEW: 4 network query hooks
│   └── useTPSHistory.ts       # ✅ NEW: TPS history state hook
├── components/
│   └── charts/
│       ├── index.ts           # ✅ NEW: Barrel export
│       ├── TPSChart.tsx       # ✅ NEW: TPS trend chart
│       ├── EpochProgress.tsx  # ✅ NEW: Epoch progress display
│       └── SearchBar.tsx      # ✅ NEW: Search component
└── pages/
    └── Home.tsx               # ✅ REFACTORED: 394 → 174 lines
```

---

## 8. Rollback

If issues arise:
```bash
git checkout explorer-refactor-pre
```
