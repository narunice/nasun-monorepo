# Refactoring Proposal: Nasun Website (Level 4 - Critical)

## 1. Project Overview
- **Path:** `apps/nasun-website`
- **Current State:** The largest and oldest codebase. Contains massive UI components, duplicate logic, and likely unused legacy code.
- **Refactoring Goal:** Aggressive componentization, removal of duplication, and standardization of state management.

## 2. Key Issues & Analysis

### A. Massive UI Components
- **File:** `src/components/app/home/ButtonShowcaseSection.tsx` (~1008 lines)
- **Problem:** Likely repeats JSX for every single button variant. Extremely redundant.
- **File:** `UserInfo.tsx` (584 lines), `routesConfig.ts` (548 lines).

### B. Code Duplication
- **Problem:** `features/leaderboard` and `components/app/Leaderboard` both exist.
- **File:** `leaderboard.ts` and `userRankApi.ts` appear in both locations.
- **Risk:** Inconsistent state, bug fixes applied to one but missed in the other.

### C. Routes Configuration
- **File:** `src/config/routesConfig.ts` (548 lines)
- **Problem:** A single file managing all routes, lazy loading, and likely metadata.
- **Risk:** Merge conflicts, hard to navigate.

## 3. Refactoring Plan

### Phase 1: De-duplication (Critical)
1. **Consolidate Leaderboard Logic**
   - audit both `features/leaderboard` and `components/app/Leaderboard`.
   - Move "Source of Truth" to `src/features/leaderboard` (Domain logic).
   - `components/app/Leaderboard` should only contain UI components that *use* the feature logic.
   - Delete duplicate files.

### Phase 2: Component Refactoring (Showcase)
1. **Refactor `ButtonShowcaseSection.tsx`**
   - Create `ButtonVariantRow` component.
   - Use a configuration array:
     ```typescript
     const BUTTON_VARIANTS = [
       { name: 'Scarlet', variant: 'scarlet' },
       { name: 'Amber', variant: 'c1' },
       // ...
     ];
     ```
   - Map over this array to render the section.
   - **Target:** Reduce file size from 1000 lines to ~100 lines.

### Phase 3: Route Splitting
1. **Split `routesConfig.ts`**
   - `src/routes/mainRoutes.ts` (Home, About, Vision)
   - `src/routes/appRoutes.ts` (Leaderboard, Roadmap)
   - `src/routes/authRoutes.ts` (Login, Callback)
   - `src/routes/index.ts` (Combine them)

## 4. Expected Outcome
- Significant reduction in codebase size (removing 500+ lines of redundancy in just one component).
- Elimination of "Split Brain" logic issues in Leaderboard.
- Easier navigation for developers.
