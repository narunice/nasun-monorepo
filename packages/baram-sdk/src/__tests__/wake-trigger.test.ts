import { describe, expect, it } from 'vitest';

import {
  ACTIVE_WAKE_TRIGGERS,
  WAKE_TRIGGER_VALUES,
  isActiveWakeTrigger,
  wakeTriggerFromValue,
  wakeTriggerToValue,
} from '../wake-trigger';

describe('wake-trigger', () => {
  it('mirrors contract enum values (heartbeat=1 .. coordination=5)', () => {
    expect(WAKE_TRIGGER_VALUES.heartbeat).toBe(1);
    expect(WAKE_TRIGGER_VALUES.user_message).toBe(2);
    expect(WAKE_TRIGGER_VALUES.price_alert).toBe(3);
    expect(WAKE_TRIGGER_VALUES.manual).toBe(4);
    expect(WAKE_TRIGGER_VALUES.coordination).toBe(5);
  });

  it('round-trips name <-> value', () => {
    for (const [name, value] of Object.entries(WAKE_TRIGGER_VALUES)) {
      expect(wakeTriggerFromValue(value)).toBe(name);
      expect(wakeTriggerToValue(name as keyof typeof WAKE_TRIGGER_VALUES)).toBe(value);
    }
  });

  it('returns "unknown" for unrecognized values (forward-compat)', () => {
    expect(wakeTriggerFromValue(99)).toBe('unknown');
    expect(wakeTriggerFromValue(0)).toBe('unknown');
  });

  it('marks only the three Phase 1 triggers as active', () => {
    expect(isActiveWakeTrigger('heartbeat')).toBe(true);
    expect(isActiveWakeTrigger('user_message')).toBe(true);
    expect(isActiveWakeTrigger('manual')).toBe(true);
    expect(isActiveWakeTrigger('price_alert')).toBe(false);
    expect(isActiveWakeTrigger('coordination')).toBe(false);
    expect(ACTIVE_WAKE_TRIGGERS.size).toBe(3);
  });
});
