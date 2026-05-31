import { describe, it } from 'vitest';

/**
 * Phase 4 stub — on-chain ↔ TS parity test.
 *
 * Activated once `nasun_tier` is republished and `NASUN_TIER_PACKAGE_ID` is
 * set in the test environment. Currently the on-chain `nasun_tier` package
 * was published 2026-05-22 (see devnet-ids.json `nasunTier.packageId`),
 * but source/onchain divergence is not yet asserted in CI.
 *
 * When activated:
 *   - issue `devInspectTransactionBlock` calls invoking
 *     `nasun_tier::policy::fee_discount_bps(u8)` etc. for tiers 1/2/3
 *   - assert returned bcs values equal TIER_BENEFITS fields
 *   - skip cleanly when env is unset (current default)
 *
 * Until then this file exists as a placeholder so the testing surface and
 * docs stay aligned. Activate by removing the `.skipIf` and providing a
 * minimal Sui SDK client.
 */
const PKG = process.env.NASUN_TIER_PACKAGE_ID;

describe.skipIf(!PKG)('nasun_tier on-chain ↔ TS parity (Phase 4)', () => {
  it('placeholder — implement when activating Phase 4', () => {
    // Intentionally unimplemented. When PKG is set the test will fail loudly
    // and force implementation, which is the desired prompt.
    throw new Error(
      'on-chain parity test not yet implemented; ' +
        'remove this throw when wiring up devInspectTransactionBlock.',
    );
  });
});
