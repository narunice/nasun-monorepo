import { describe, it, expect } from 'vitest';
import { splitTitle } from './title-split';

describe('splitTitle', () => {
  it('splits crypto Binance-at suffix into Binance subtitle', () => {
    const r = splitTitle(
      'Will BNB (BNB/USDT) close above $707.23 on Binance at 2026-05-20 08:31:31 UTC?',
    );
    expect(r.main).toBe('Will BNB (BNB/USDT) close above $707.23?');
    expect(r.subtitle).toBe('Binance · 2026-05-20 08:31 UTC');
  });

  it('splits stock "on YYYY-MM-DD" suffix into By-date subtitle', () => {
    const r = splitTitle(
      'Will Apple Inc. (AAPL) close above 292.25 USD on 2026-05-20?',
    );
    expect(r.main).toBe('Will Apple Inc. (AAPL) close above 292.25 USD?');
    expect(r.subtitle).toBe('By 2026-05-20');
  });

  it('splits KRW stock with currency suffix', () => {
    const r = splitTitle(
      'Will NAVER Corporation (035420.KS) close above 208,180 KRW on 2026-05-21?',
    );
    expect(r.main).toBe('Will NAVER Corporation (035420.KS) close above 208,180 KRW?');
    expect(r.subtitle).toBe('By 2026-05-21');
  });

  it('splits space "within +/- 24h of scheduled NET"', () => {
    const r = splitTitle(
      'Will Falcon 9 Block 5 | Starlink Group 17-42 lift off within +/- 24h of its scheduled NET?',
    );
    expect(r.main).toBe('Will Falcon 9 Block 5 | Starlink Group 17-42 lift off?');
    expect(r.subtitle).toBe('Within +/- 24h of scheduled NET');
  });

  it('keeps short mission-success question intact', () => {
    const r = splitTitle('Will Falcon 9 Block 5 | Starlink Group 17-42 succeed?');
    expect(r.main).toBe('Will Falcon 9 Block 5 | Starlink Group 17-42 succeed?');
    expect(r.subtitle).toBeNull();
  });

  it('returns original question when no pattern matches', () => {
    const r = splitTitle('Will it rain tomorrow?');
    expect(r.main).toBe('Will it rain tomorrow?');
    expect(r.subtitle).toBeNull();
  });

  it('falls back to no split when main would be too short', () => {
    const r = splitTitle('Up on 2026-05-21?');
    expect(r.main).toBe('Up on 2026-05-21?');
    expect(r.subtitle).toBeNull();
  });

  it('handles missing seconds in UTC timestamp', () => {
    const r = splitTitle(
      'Will BTC (BTC/USDT) close above $70000 on Binance at 2026-06-01 12:00 UTC?',
    );
    expect(r.main).toBe('Will BTC (BTC/USDT) close above $70000?');
    expect(r.subtitle).toBe('Binance · 2026-06-01 12:00 UTC');
  });

  it('handles empty input', () => {
    const r = splitTitle('');
    expect(r.main).toBe('');
    expect(r.subtitle).toBeNull();
  });
});
