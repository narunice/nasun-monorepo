import { describe, expect, it } from 'vitest';
import { BANKROLL_POOL, STREAMS } from './contracts.js';

// Event type tags bind to the package that first defined the struct. These
// were all defined by the v8 fresh publish, so they tag with originalPackageId
// however many upgrades follow. A struct added by a later upgrade tags with
// that upgrade's id instead and belongs in its own list, not here.
const ORIGINAL_PACKAGE_EVENTS = [
  'GameResult',
  'BetRefunded',
  'TreasuryDeposited',
  'LiquidityProvided',
  'WithdrawRequested',
  'LiquidityRedeemed',
  'PoolSharesSeeded',
  'UtilizationCapUpdated',
  'OpenExposureSnapshot',
];

describe('STREAMS event type tags', () => {
  it.each(ORIGINAL_PACKAGE_EVENTS)('keys bankroll_pool::%s on the original package', (eventName) => {
    const row = STREAMS.find((s) => s.module === 'bankroll_pool' && s.eventName === eventName);
    expect(row, eventName).toBeDefined();
    expect(row?.originalPackageId).toBe(BANKROLL_POOL.originalPackageId);
  });
});
