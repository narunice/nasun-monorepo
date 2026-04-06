# Handoff: Referral Bonus x Ecosystem Points Integration

**Date**: 2026-04-06
**Branch**: main
**Commits**: `c3a8f55f`, `c528d3f8`

## Current Status

Referral bonus is now integrated into the ecosystem points system as a **separate, scaled term**. The backend API, daily snapshot, and leaderboard all reflect referral bonuses in ecosystem score. Frontend UI shows referral bonus distinctly in tooltips and daily logs. The ReferralCard UI itself is still hidden (commented out) in MyAccountPage.

## Completed

- [x] `REFERRAL_ECOSYSTEM_SCALING_FACTOR` config (default 0.5, env: `REFERRAL_ECOSYSTEM_SCALING`)
- [x] Score API (`GET /ecosystem/score/:id`) returns `referralBonus`, `referralScalingFactor`
- [x] Leaderboard API includes referral bonus in `ecosystemScore`
- [x] Daily snapshot records `referral_bonus` column
- [x] Snapshot history API returns `referralBonus`
- [x] Bonus history API includes `referral-bonus` category
- [x] Frontend types updated (`EcosystemScoreData`, `SnapshotHistoryEntry`)
- [x] EcosystemPointsCard: referral shown in emerald color with "(x0.5)" indicator
- [x] ReferralCard description updated to reference ecosystem points

## Not Done

- [ ] **DB schema migration**: `ALTER TABLE ecosystem_score_snapshots ADD COLUMN IF NOT EXISTS referral_bonus NUMERIC(10,2) NOT NULL DEFAULT 0;` must be run on production DB before deploying api-server code
- [ ] **ReferralCard UI activation**: Still commented out in `MyAccountPage.tsx` (line ~169). Uncomment when ready to launch referral program
- [ ] **Frontend deployment**: Build and deploy to staging, then production
- [ ] **API server deployment**: Deploy updated api-server + PM2 restart

## Architecture

### Formula

```
ecosystem_score = (base_score x multiplier) + bonusTotal + (referralBonus x SCALING_FACTOR)
```

- `bonusTotal`: ecosystem-bonus-% categories (earlybird, pado, game, airdrop)
- `referralBonus`: referral-bonus category (10% referrer / 5% referred)
- `SCALING_FACTOR`: 0.5 default, tunable via env var without code deploy

### Why separate field (not merged into bonusTotal)

1. Referral bonuses are continuous (activity-proportional), unlike one-time ecosystem bonuses
2. Scaling factor allows tuning referral impact on leaderboard without affecting other bonuses
3. Semantic distinction preserved in data model
4. No DB migration needed for existing `activity_points` data (category stays `referral-bonus`)

### Why not rename category to `ecosystem-bonus-referral`

- Would require DB migration (`UPDATE activity_points`)
- Anti-cascading guard in `referral-bonus.ts:225` would need updating
- Deploy ordering becomes critical (scanner must stop during migration)
- All avoided by keeping category name and querying separately

## Key Files

### Backend (network-explorer/api-server)

| File | Change |
|------|--------|
| `src/config/referral.ts` | `REFERRAL_ECOSYSTEM_SCALING_FACTOR` constant |
| `src/config/ecosystem.ts` | `safeFloat` exported |
| `src/routes/ecosystem.ts` | Score, leaderboard, snapshot-history, bonus-history APIs |
| `src/scanner/daily-snapshot.ts` | Referral query + `referral_bonus` column in INSERT |
| `src/db/snapshot-schema.sql` | `referral_bonus` column definition |

### Frontend (nasun-website/frontend)

| File | Change |
|------|--------|
| `src/services/ecosystemScoreApi.ts` | `referralBonus`, `referralScalingFactor` types |
| `src/sections/myAccount/EcosystemPointsCard.tsx` | Referral in tooltips, daily log, BONUS_LABELS |
| `src/sections/myAccount/ReferralCard.tsx` | Description text updated |

### Unchanged (intentionally)

| File | Reason |
|------|--------|
| `src/scanner/referral-bonus.ts` | Category `referral-bonus` preserved, no cascade guard change needed |
| `src/db/ecosystem-schema.sql` | Matview correctly excludes `referral-bonus` from `base_score` |
| `src/scanner/daily-nft-check.ts` | `EXCLUDED_CATEGORIES` already has `referral-bonus` |

## Deployment Sequence

1. SSH into DB host and run ALTER TABLE (zero-downtime, DEFAULT 0)
2. Deploy api-server code, PM2 restart
3. Build and deploy frontend to staging
4. Verify on staging: score API shows `referralBonus`, leaderboard reflects it
5. Deploy frontend to production

## Scaling Factor Tuning

Change without code deploy:
```bash
# On api-server host
export REFERRAL_ECOSYSTEM_SCALING=0.3  # or any value 0-1
pm2 restart api-server
```

Current value: 0.5 (referral bonuses contribute at half their raw value to ecosystem score).
