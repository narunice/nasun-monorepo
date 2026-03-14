# Leaderboard Intermittent Loading Failure Analysis

- Date: 2026-03-13 18:57 KST
- Symptom: Leaderboard page showed "Failed to load leaderboard" error, resolved on reload
- Severity: Low (self-recovering)

## Root Cause: Lambda Cold Start

The leaderboard API runs on AWS Lambda behind API Gateway. During low-traffic periods (evening), Lambda instances go cold. The first request triggers a cold start (several seconds of initialization), which can cause timeout or slow response.

## Reproduction Scenario

1. No traffic to leaderboard API for ~15 minutes (Lambda scales to zero)
2. User visits leaderboard page
3. `getSeasons` API call hits cold Lambda, response delayed
4. `getSeasonLeaderboard` call follows, may also hit cold Lambda
5. If response exceeds 15-second `fetchWithTimeout` threshold, error is thrown
6. UI displays error state: "Failed to load leaderboard. Please try again later."
7. User reloads - Lambda is now warm, responds instantly

## Affected Code Path

```
LeaderboardV3Page
  -> ErrorBoundary (fallback: v3.loadError message)
    -> LeaderboardV3
      -> useLeaderboardState
        -> useSeasons()            -> getSeasons()            -> fetchWithTimeout(15s)
        -> useSeasonLeaderboard()  -> getSeasonLeaderboard()  -> fetchWithTimeout(15s)
```

### Key Files

| File | Role |
|------|------|
| `apps/nasun-website/frontend/src/pages/LeaderboardV3Page.tsx` | Page with ErrorBoundary |
| `apps/nasun-website/frontend/src/features/leaderboard-v3/components/LeaderboardV3.tsx` | Error state rendering (line 72-76) |
| `apps/nasun-website/frontend/src/features/leaderboard-v3/hooks/useLeaderboardState.ts` | State orchestration |
| `apps/nasun-website/frontend/src/features/leaderboard-v3/hooks/useSeasons.ts` | Season fetching (no explicit retry) |
| `apps/nasun-website/frontend/src/features/leaderboard-v3/hooks/useSeasonLeaderboard.ts` | Leaderboard fetching (no explicit retry) |
| `apps/nasun-website/frontend/src/features/leaderboard-v3/services/leaderboardV3Api.ts` | API client with fetchWithTimeout |
| `apps/nasun-website/frontend/src/utils/fetchWithTimeout.ts` | 15-second timeout wrapper |

## Current Resilience Gaps

1. **fetchWithTimeout**: 15-second timeout may be tight for cold start scenarios
2. **useSeasons**: No explicit `retry` config (relies on react-query default of 3, but each retry waits up to 15s)
3. **useSeasonLeaderboard**: Same issue as useSeasons
4. **No user-facing retry button**: Error state has no "Try Again" action

## Potential Improvements (Not Yet Applied)

### Option A: Frontend retry/timeout tuning (zero cost)
- Increase `fetchWithTimeout` to 20s for leaderboard API calls
- Add explicit `retry: 2` to `useSeasons` and `useSeasonLeaderboard` hooks
- Add a "Try Again" button to the error state UI

### Option B: Lambda warming (has cost)
- EventBridge schedule to ping Lambda every 5 minutes
- Or Provisioned Concurrency (higher cost, guaranteed warm)

### Option C: Accept current behavior
- Cold start is infrequent (low-traffic periods only)
- Self-recovers on reload
- No data loss or corruption risk

## Decision

2026-03-13: Accepted as-is (Option C). The issue is infrequent and self-recovering. Will revisit if user reports increase.
