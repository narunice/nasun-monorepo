# Refactoring Proposal: Gen Sol Website (Level 2 - Moderate)

## 1. Project Overview
- **Path:** `apps/gensol-website`
- **Current State:** Structured with features/hooks, but contains some large page sections and complex utility files.
- **Refactoring Goal:** Break down large "Page Sections" into smaller UI components and clean up the authentication provider.

## 2. Key Issues & Analysis

### A. Large Page Sections
- **File:** `src/app/home/ProjectStrengths.tsx` (~413 lines)
- **Problem:** Likely contains a large amount of static content, SVG icons, or repetitive layout code.
- **File:** `src/app/home/NewsSection.tsx` (162 lines), `ArkGalaxySection.tsx` (149 lines).
- **Risk:** "Home" page becomes heavy and difficult to maintain.

### B. Complex Auth Logic
- **File:** `src/features/auth/providers/AuthContext.tsx` (363 lines)
- **Problem:** Handles Metamask, Google, Twitter auth all in one context.
- **Risk:** High coupling; changing one auth method might break others.

### C. Heavy Utilities
- **File:** `src/utils/metamaskUtils.ts` (379 lines)
- **Problem:** Contains low-level Ethereum provider interaction, signing, error handling, and type conversion.

## 3. Refactoring Plan

### Phase 1: UI Component Extraction
1. **Refactor `ProjectStrengths.tsx`**
   - Identify repetitive "Strength Cards" or "Feature Items".
   - Create `src/components/ui/FeatureCard.tsx`.
   - Move static data (text, image paths) to `src/constants/homeData.ts` or a JSON file.
   - Use `.map()` to render the section.

### Phase 2: Auth Provider Split
1. **Create Auth Hooks**
   - Split `AuthContext` logic into smaller hooks:
     - `useMetamaskAuth.ts`
     - `useSocialAuth.ts` (Google/Twitter)
   - `AuthContext` should simply compose these hooks and provide the global state.

### Phase 3: Service Layer Refinement
1. **Refactor `metamaskUtils.ts`**
   - Group related functions (e.g., `SignerUtils`, `NetworkUtils`).
   - Move complex error parsing to a separate `src/utils/errorParser.ts`.

## 4. Expected Outcome
- Homepage code becomes declarative and data-driven.
- Auth logic is modular, making it easier to add new wallets or social providers later.
