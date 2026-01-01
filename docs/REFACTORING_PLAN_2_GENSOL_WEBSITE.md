# Refactoring Proposal: Gen Sol Website (Level 2 - Moderate)

## 1. Project Overview
- **Path:** `apps/gensol-website`
- **Current State:** Structured with features/hooks, but contains some large page sections and complex utility files.
- **Refactoring Goal:** Break down large "Page Sections" into smaller UI components and clean up the authentication provider.

---

## 2. Verification Results (Claude Review)

### Gemini Analysis Accuracy: 90/100

| Item | Gemini Analysis | Actual Status | Verdict |
|------|-----------------|---------------|---------|
| `ProjectStrengths.tsx` | ~413 lines | **413 lines** | ✅ Accurate |
| `AuthContext.tsx` | 363 lines | **363 lines** | ✅ Accurate |
| `metamaskUtils.ts` | 379 lines | **379 lines** | ✅ Accurate |
| Auth needs split | Create new hooks | ⚠️ **Structure exists** | Partial |
| NewsSection | 162 lines, issue | ✅ **Well structured** | ❌ Over-estimated |

### Key Findings

**Auth Structure Already Exists:**
```
features/auth/
├── providers/
│   └── AuthContext.tsx (363 lines - still large)
├── components/
│   ├── LoginModal.tsx
│   ├── GoogleLoginButton.tsx
│   ├── TwitterLoginButton.tsx
│   └── MetaMaskLoginButton.tsx
├── routes/
│   └── Callback.tsx
└── index.ts (barrel export)
```

**NewsSection is Well Organized (162 lines):**
- Has `LoadingSkeleton` component
- Has `ErrorState` component
- Has `EmptyState` component
- Has `NewsCard` component
- Clean separation of concerns

**Reusable Components Already Exist (101 files):**
- `components/common/FadeIn.tsx`
- `components/common/FadeInUp.tsx`
- `components/common/PulsePoint.tsx`
- `components/common/Loading.tsx`
- `components/common/AutoPlayVideo.tsx`
- `components/ui/button.tsx`

---

## 3. Key Issues & Analysis

### A. Large Page Sections ⚠️ Real Issue
- **File:** `src/app/home/ProjectStrengths.tsx` (413 lines)
- **Problem:**
  - 60 inline `className` attributes
  - 3 nested component definitions (RedCircle, PulsePoint, TagItem)
  - Desktop/mobile rendering branches
  - Mixed static data + UI logic + styles
- **File:** `src/app/home/NewsSection.tsx` (162 lines) ✅ **Well structured, no action needed**
- **File:** `src/app/home/ArkGalaxySection.tsx` (149 lines) ✅ **Compact, well organized**

### B. Complex Auth Logic ⚠️ Partial Issue
- **File:** `src/features/auth/providers/AuthContext.tsx` (363 lines)
- **Actual Problem:** AuthContext handles too many responsibilities:
  - OAuth redirect processing
  - Cognito Identity management
  - API communication (profile CRUD)
  - State management
  - 3 login method handlers
- **Note:** Auth components are already separated, but the context itself is still large

### C. Heavy Utilities ✅ Acceptable
- **File:** `src/utils/metamaskUtils.ts` (379 lines)
- **Status:** Contains necessary Web3 provider interaction
- **Lower Priority:** Functional but could benefit from modularization

---

## 4. Revised Refactoring Plan

### Phase 1: ProjectStrengths.tsx Decomposition ⏱️ 2 hours
**Priority: HIGH**

1. **Extract sub-components:**
   ```
   src/app/home/ProjectStrengths/
   ├── index.tsx              # Main component (~100 lines)
   ├── RedCircle.tsx          # Extracted component
   ├── TagItem.tsx            # Extracted component
   └── strengthsData.ts       # Static content data
   ```

2. **Create data-driven structure:**
   ```typescript
   // strengthsData.ts
   export const STRENGTHS = [
     {
       title: "Innovation",
       description: "...",
       tags: ["tag1", "tag2"],
       icon: "innovation"
     },
     // ...
   ];
   ```

3. **Expected reduction:** 413 lines → 150 lines (64% reduction)

### Phase 2: AuthContext Hook Extraction ⏱️ 2 hours
**Priority: MEDIUM**

1. **Create specialized hooks:**
   ```
   src/features/auth/hooks/
   ├── useGoogleAuth.ts       # Google OAuth logic
   ├── useTwitterAuth.ts      # Twitter OAuth logic
   ├── useMetaMaskAuth.ts     # MetaMask logic
   └── useCognitoIdentity.ts  # Cognito management
   ```

2. **Simplify AuthContext:**
   - Compose the hooks
   - Provide unified state
   - Handle only coordination logic

3. **Expected reduction:** 363 lines → 200 lines (45% reduction)

### Phase 3: MetaMask Utils Modularization ⏱️ 1 hour
**Priority: LOW**

1. **Split into focused modules:**
   ```
   src/utils/web3/
   ├── walletConnection.ts    # Connection logic
   ├── networkManagement.ts   # Network switching
   ├── messageSigning.ts      # Signature handling
   └── errorParser.ts         # Error translation
   ```

---

## 5. Expected Outcome

| Metric | Before | After |
|--------|--------|-------|
| `ProjectStrengths.tsx` | 413 lines | ~150 lines |
| `AuthContext.tsx` | 363 lines | ~200 lines |
| New hook files | 0 | 4 |
| Total inline className | 60 | ~20 |

### Benefits
- Homepage code becomes declarative and data-driven
- Auth logic is modular, easier to test
- Easier to add new auth providers
- Better code organization

---

## 6. Estimated Effort

| Phase | Time | Priority |
|-------|------|----------|
| Phase 1: ProjectStrengths | 2 hours | High |
| Phase 2: AuthContext Hooks | 2 hours | Medium |
| Phase 3: MetaMask Utils | 1 hour | Low |
| **Total** | **4-6 hours** | - |

---

## 7. Files to Modify

```
apps/gensol-website/frontend/src/
├── app/home/
│   ├── ProjectStrengths/
│   │   ├── index.tsx         # NEW: Main component
│   │   ├── RedCircle.tsx     # NEW: Extracted
│   │   ├── TagItem.tsx       # NEW: Extracted
│   │   └── strengthsData.ts  # NEW: Static data
│   └── ProjectStrengths.tsx  # DELETE: Original file
├── features/auth/
│   ├── providers/
│   │   └── AuthContext.tsx   # MODIFY: Simplify
│   └── hooks/
│       ├── useGoogleAuth.ts      # NEW
│       ├── useTwitterAuth.ts     # NEW
│       ├── useMetaMaskAuth.ts    # NEW
│       └── useCognitoIdentity.ts # NEW
└── utils/
    └── web3/                 # NEW: Modularized utils
        ├── walletConnection.ts
        ├── networkManagement.ts
        ├── messageSigning.ts
        └── errorParser.ts
```

---

## 8. Notes

### Already Well-Structured (No Action Needed)
- `NewsSection.tsx` - Has proper loading/error states
- `ArkGalaxySection.tsx` - Compact and organized
- Auth components (LoginModal, buttons) - Already separated
- Common components (FadeIn, Loading, etc.) - Already reusable

### Deprecated Code to Clean Up
- `providers/auth/index.ts` - Marked as @deprecated
- Should be removed after verifying no imports remain
