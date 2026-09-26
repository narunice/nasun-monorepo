/**
 * Tests for risk-alert constants. The full runRiskAlertOnce path is DB +
 * Sui RPC + Telegram HTTP-bound; verification is end-to-end on staging
 * (force-utilization spike → assert telegram delivery + cooldown).
 *
 * Here we just lock the v1 contract: threshold = 60.00% (6_000 bps), interval
 * 5 min, cooldown 30 min. Regressions to these constants would silently
 * shift alerting behavior — keep them in test guardrails so a future "tune
 * threshold" PR has to update both code and test.
 */

import { describe, expect, it } from 'vitest';
import { _RISK_ALERT_CONSTANTS, _cooldownFor } from './risk-alert.js';

describe('risk-alert constants (v1 HG2 policy)', () => {
  it('utilization threshold is 60.00% (6_000 bps)', () => {
    expect(_RISK_ALERT_CONSTANTS.UTILIZATION_THRESHOLD_BPS).toBe(6_000);
  });

  it('interval is 5 minutes', () => {
    expect(_RISK_ALERT_CONSTANTS.RISK_ALERT_INTERVAL_MS).toBe(5 * 60_000);
  });

  it('cooldown is 30 minutes — at least 5x the interval to avoid pager fatigue', () => {
    expect(_RISK_ALERT_CONSTANTS.RISK_ALERT_COOLDOWN_MS).toBe(30 * 60_000);
    expect(_RISK_ALERT_CONSTANTS.RISK_ALERT_COOLDOWN_MS).toBeGreaterThanOrEqual(
      5 * _RISK_ALERT_CONSTANTS.RISK_ALERT_INTERVAL_MS,
    );
  });
});

describe('per-key cooldown overrides', () => {
  it('threshold alerts keep the 30-minute default', () => {
    expect(_cooldownFor('utilization_high')).toBe(_RISK_ALERT_CONSTANTS.RISK_ALERT_COOLDOWN_MS);
    expect(_cooldownFor('lp_concentration_extreme')).toBe(
      _RISK_ALERT_CONSTANTS.RISK_ALERT_COOLDOWN_MS,
    );
  });

  it('utilization_unmeasurable backs off to daily', () => {
    // It reports a standing condition only a contract upgrade can clear, so
    // repeating it on the incident cadence would train the operator to skim
    // the channel — the exact failure that hid the 2026-07-06 NSI outage for
    // seven weeks.
    expect(_cooldownFor('utilization_unmeasurable')).toBe(24 * 3_600_000);
    expect(_cooldownFor('utilization_unmeasurable')).toBeGreaterThan(
      _RISK_ALERT_CONSTANTS.RISK_ALERT_COOLDOWN_MS,
    );
  });
});
