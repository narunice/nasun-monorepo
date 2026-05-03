/**
 * Tests for market trading calendar.
 *
 * These guard the static holiday tables and the next-trading-day shift used by
 * the finance market creation script. A wrong holiday entry would create
 * markets with close_time on a non-trading day, making them unresolvable
 * within the keeper's deadline window.
 */

import { describe, it, expect } from 'vitest';
import {
  isTradingDay,
  nextTradingDay,
  sessionCloseUtc,
  localDateString,
} from './market-holidays.js';

describe('isTradingDay', () => {
  it('weekend in NYSE local time is non-trading', () => {
    expect(isTradingDay('NYSE', new Date('2026-05-09T15:00:00Z'))).toBe(false); // Sat
    expect(isTradingDay('NYSE', new Date('2026-05-10T15:00:00Z'))).toBe(false); // Sun
  });

  it('weekday in NYSE local time is trading', () => {
    expect(isTradingDay('NYSE', new Date('2026-05-11T15:00:00Z'))).toBe(true); // Mon
    expect(isTradingDay('NYSE', new Date('2026-05-12T15:00:00Z'))).toBe(true); // Tue
  });

  it('US holidays (Christmas, Thanksgiving, Independence Day observed) are non-trading', () => {
    expect(isTradingDay('NYSE', new Date('2026-12-25T15:00:00Z'))).toBe(false);
    expect(isTradingDay('NYSE', new Date('2026-11-26T15:00:00Z'))).toBe(false);
    expect(isTradingDay('NYSE', new Date('2026-07-03T15:00:00Z'))).toBe(false);
  });

  it('KR Chuseok 2026 (Sep 24-26) all non-trading', () => {
    expect(isTradingDay('KRX', new Date('2026-09-24T03:00:00Z'))).toBe(false);
    expect(isTradingDay('KRX', new Date('2026-09-25T03:00:00Z'))).toBe(false);
    expect(isTradingDay('KRX', new Date('2026-09-26T03:00:00Z'))).toBe(false);
  });

  it('KR Lunar New Year 2026 (Feb 16-18) non-trading', () => {
    expect(isTradingDay('KRX', new Date('2026-02-16T03:00:00Z'))).toBe(false);
    expect(isTradingDay('KRX', new Date('2026-02-18T03:00:00Z'))).toBe(false);
    expect(isTradingDay('KRX', new Date('2026-02-19T03:00:00Z'))).toBe(true);
  });

  it('weekend in KRX local time is non-trading', () => {
    // 2026-05-02 is Saturday in Seoul.
    expect(isTradingDay('KRX', new Date('2026-05-02T03:00:00Z'))).toBe(false);
  });
});

describe('nextTradingDay', () => {
  it('returns input if already a trading day', () => {
    const d = new Date('2026-05-11T15:00:00Z'); // Mon
    expect(localDateString('NYSE', nextTradingDay('NYSE', d))).toBe('2026-05-11');
  });

  it('Saturday -> Monday for NYSE', () => {
    const sat = new Date('2026-05-09T15:00:00Z');
    expect(localDateString('NYSE', nextTradingDay('NYSE', sat))).toBe('2026-05-11');
  });

  it('Christmas Day (Friday 2026-12-25) -> next Monday', () => {
    const xmas = new Date('2026-12-25T15:00:00Z');
    expect(localDateString('NYSE', nextTradingDay('NYSE', xmas))).toBe('2026-12-28');
  });

  it('Chuseok eve (2026-09-24 Thu) -> Monday Sep 28', () => {
    const chuseok = new Date('2026-09-24T03:00:00Z');
    expect(localDateString('KRX', nextTradingDay('KRX', chuseok))).toBe('2026-09-28');
  });
});

describe('sessionCloseUtc', () => {
  it('NYSE close on 2026-05-11 (DST active) = 20:00 UTC', () => {
    const close = sessionCloseUtc('NYSE', new Date('2026-05-11T15:00:00Z'));
    expect(new Date(close).toISOString()).toBe('2026-05-11T20:00:00.000Z');
  });

  it('NYSE close on 2026-12-15 (standard time) = 21:00 UTC', () => {
    const close = sessionCloseUtc('NYSE', new Date('2026-12-15T15:00:00Z'));
    expect(new Date(close).toISOString()).toBe('2026-12-15T21:00:00.000Z');
  });

  it('KRX close on 2026-05-11 = 06:30 UTC (KST never has DST)', () => {
    const close = sessionCloseUtc('KRX', new Date('2026-05-11T03:00:00Z'));
    expect(new Date(close).toISOString()).toBe('2026-05-11T06:30:00.000Z');
  });
});
