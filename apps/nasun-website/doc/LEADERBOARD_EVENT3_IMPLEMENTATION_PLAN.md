# Leaderboard EVENT3 Addition Implementation Plan

**Date**: 2025-12-09
**Target**: Add `EVENT3` leaderboard for the period **December 11, 2025 - December 30, 2025**.

---

## 1. Overview
This plan details the steps to introduce a new leaderboard event, "Season 3" (EVENT3), into the existing system. The implementation involves updating backend environment variables, Lambda logic, frontend types, and UI components.

**Event Details:**
- **ID**: `EVENT3`
- **Name**: Season 3 (시즌 3)
- **Start Date**: 2025-12-11
- **End Date**: 2025-12-30

---

## 2. Pre-requisites & Backup
Before applying changes, ensure the current system is stable and a backup point is created.

### 2.1 Git Tagging (Rollback Point)
Create a git tag to mark the state before changes.
```bash
git tag pre-event3-addition-20251209
git push origin pre-event3-addition-20251209
```

---

## 3. Implementation Steps

### Phase 1: Backend Implementation (CDK & Lambda)

#### Step 1.1: Update CDK Environment Variables
Modify `cdk/.env` (and `.env.production`) to include EVENT3 dates and visibility.

**Action**: Add/Update the following lines:
```properties
EVENT3_START_DATE=2025-12-11
EVENT3_END_DATE=2025-12-30
VISIBLE_LEADERBOARDS=CUMULATIVE,EVENT1,EVENT2,EVENT3
```

#### Step 1.2: Update Lambda Environment Utils
Modify `cdk/lambda-src/x-leaderboard/src/utils/env.ts`.

**Action**:
1.  Update `EnvConfigV2` interface to include `event3StartDate` and `event3EndDate`.
2.  Update `getEnvConfigV2` function to read these new variables.

#### Step 1.3: Update API Handler
Modify `cdk/lambda-src/x-leaderboard/src/handlers/api/get-leaderboard-config.ts`.

**Action**:
1.  Add `{ id: 'EVENT3', name: 'Season 3' }` to `LEADERBOARD_DEFINITIONS`.
2.  Add logic to map `EVENT3` to its start/end dates from the config.

### Phase 2: Frontend Implementation

#### Step 2.1: Update TypeScript Types
Modify `frontend/src/types/leaderboard.d.ts`.

**Action**:
1.  Update `LeaderboardPeriodId` type:
    ```typescript
    export type LeaderboardPeriodId = 'CUMULATIVE' | 'EVENT1' | 'EVENT2' | 'EVENT3';
    ```

#### Step 2.2: Update Enums
Modify `frontend/src/components/app/Leaderboard/types/leaderboard.ts`.

**Action**:
1.  Update `CumulativePeriod` enum:
    ```typescript
    export enum CumulativePeriod {
      CUMULATIVE = 'cumulative',
      EVENT1 = 'event1',
      EVENT2 = 'event2',
      EVENT3 = 'event3',
    }
    ```

#### Step 2.3: Update Translations
Update translation files for "Season 3".

**Files**:
- `frontend/src/assets/locales/en/leaderboard.json`
- `frontend/src/assets/locales/ko/leaderboard.json`
- `frontend/src/assets/locales/en/myAccount.json`
- `frontend/src/assets/locales/ko/myAccount.json`

**Action**: Add `"event3": "Season 3"` (or "시즌 3") to relevant sections.

### Phase 3: Deployment

#### Step 3.1: Deploy Backend
```bash
cd cdk
pnpm deploy:dev  # For development/staging check
# Verify then:
pnpm deploy:prod # For production
```

#### Step 3.2: Deploy Frontend
```bash
cd frontend
npm run build
# Deploy build artifacts to hosting
```

---

## 4. Verification Plan

1.  **API Check**: Call `GET /api/leaderboard/config` and verify `EVENT3` is present, active, and has correct dates.
2.  **UI Check**: Visit the Leaderboard page. Confirm "Season 3" tab appears.
3.  **Functionality Check**: Click the tab. Ensure it loads (even if empty initially).
4.  **My Account Check**: Verify "Season 3" appears in Rank History filters.

---

## 5. Rollback Plan

If critical issues arise (e.g., API 500 errors, frontend crashes), revert immediately.

### Option A: Quick Revert (Config Only)
If the issue is just visibility or dates:
1.  Edit `cdk/.env` to remove `EVENT3` from `VISIBLE_LEADERBOARDS`.
2.  Redeploy CDK stack: `pnpm cdk deploy CdkStack`.

### Option B: Full Revert (Code Reversion)
If the issue is code-breaking (e.g., type errors causing build failures):
1.  Revert code using git:
    ```bash
    git revert --no-edit HEAD
    # Or reset to tag
    # git reset --hard pre-event3-addition-20251209
    ```
2.  Rebuild Lambda:
    ```bash
    cd cdk/lambda-src/x-leaderboard
    npm run build
    ```
3.  Redeploy CDK:
    ```bash
    cd ../..
    pnpm cdk deploy CdkStack --require-approval never
    ```
4.  Revert Frontend:
    ```bash
    cd frontend
    # Revert code
    npm run build
    # Redeploy frontend
    ```

---

## 6. Documentation
After successful deployment, update `doc/LEADERBOARD_FEATURE_COMPLETION_HISTORY.md` (or similar log) to record the addition of Season 3.
