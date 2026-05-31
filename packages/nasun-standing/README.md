# @nasun/standing

Off-chain SSOT for **NSI (Nasun Standing Index)** score-to-tier derivation,
tier metadata, and user-facing copy.

## Why this package exists

The Nasun ecosystem has two interlocking sources of truth for the tier system:

- **On-chain** — `packages/nasun-tier/sources/policy.move` is the SSOT for
  `tier → benefit` (fee_discount_bps, staking_multiplier, lp_yield_multiplier,
  inference_subsidy_bps, max_bet_floor_usdc). On-chain consumers (Pado DeepBook
  fork, GoStop contracts, vault manager) enforce these.
- **Off-chain** — this package is the SSOT for `NSI score → tier` (thresholds,
  weights, monotone-up policy) and the TS mirror of the Move benefits table.
  Off-chain consumers (network-explorer api-server, NavStandingBadge,
  Pado/GoStop frontends) read from here.

Before this package, threshold constants drifted across `nsi-compute.ts`
(used 500) and `standing.ts` (used 600), so the API advertised a `next_threshold`
the cron had already crossed. This package's `source-parity.test.ts` plus
`compute.test.ts` boundary assertions block that class of regression.

## Public surface

```ts
import {
  TIER_2_THRESHOLD,           // 250
  TIER_3_THRESHOLD,           // 500
  TIER_BENEFITS,              // mirror of policy.move (5 entries × 3 tiers)
  NSI_FORMULA,                // weights + windows metadata, versioned
  TIER_BADGE_TOOLTIP_DESC,    // copy strings
  nsiToTier,                  // (score) -> 1 | 2 | 3
  applyGpFloor,               // (nsiTier, hasGp) -> Tier
  nextThreshold,              // (tier) -> next cutoff or null
  monotoneUpDisplayTier,      // (current, max_seen, until, now) -> Tier
} from '@nasun/standing';

import type {
  Tier,
  SubScores,
  TierBenefits,
  NsiFormula,
  PublicStandingResponse,
  PrivateStandingResponse,    // Phase 2 — /standing/me endpoint
} from '@nasun/standing';
```

## Source-of-truth contracts

| Constant            | SSOT location                                | Mirrored in this package           |
|---------------------|----------------------------------------------|------------------------------------|
| score → tier        | this package (`thresholds.ts`)               | (canonical here)                   |
| tier → fee discount | `nasun_tier::policy::fee_discount_bps`       | `TIER_BENEFITS.*.fee_discount_bps` |
| tier → staking mult | `nasun_tier::policy::staking_multiplier_bps` | `TIER_BENEFITS.*.staking_multiplier_bps` |
| tier → LP yield     | `nasun_tier::policy::lp_yield_multiplier_bps`| `TIER_BENEFITS.*.lp_yield_multiplier_bps` |
| tier → AI subsidy   | `nasun_tier::policy::inference_subsidy_bps`  | `TIER_BENEFITS.*.inference_subsidy_bps` |
| tier → max bet      | `nasun_tier::policy::max_bet_floor_usdc`     | `TIER_BENEFITS.*.gostop_max_bet_usdc_micro` |
| tier → vault create | `nasun_tier::policy::can_create_vault`       | `TIER_BENEFITS.*.can_create_vault` |
| NSI formula         | this package (`weights.ts`)                  | (canonical here)                   |
| monotone-up policy  | this package + env `NSI_MONOTONE_UP_UNTIL`   | window kind only                   |

## Parity tests

Source-parity (`__tests__/source-parity.test.ts`): parses the `JSON_ANCHOR`
comment block at the bottom of `policy.move` and asserts equality with
`TIER_BENEFITS`. Runs in CI on every commit.

On-chain parity (`__tests__/onchain-parity.test.ts`): skipped unless
`NASUN_TIER_PACKAGE_ID` is set in env. When activated (Phase 4), queries the
chain via `devInspectTransactionBlock` and asserts the deployed `policy.move`
returns the same values. Source ≠ on-chain divergence (e.g., source edited but
not yet published) is reported separately from source ↔ TS drift.

## How to change a tier benefit

1. Edit `packages/nasun-tier/sources/policy.move` entry function.
2. Update the `JSON_ANCHOR` comment block at the bottom of that file with the
   new values.
3. Update `TIER_BENEFITS` in `src/benefits.ts` to match.
4. `pnpm --filter @nasun/standing test` — source-parity test will green.
5. Republish `nasun_tier` (Phase 4 procedure).
6. Once republished and `NASUN_TIER_PACKAGE_ID` env is set,
   `pnpm --filter @nasun/standing test` re-runs the on-chain parity test.

If any of these steps is skipped, CI catches the drift before merge.

## How to change a threshold / weight

This package is the SSOT — change `src/thresholds.ts` or `src/weights.ts`,
update `compute.test.ts` boundary assertions, and ship. Coordinate with a
`formula_version_cutover` entry in the `nsi_compute_events` audit table.
