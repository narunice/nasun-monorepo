import { describe, expect, it } from 'vitest';
import { humanizeGameAbort, parseMoveAbort, STALE_PAGE_MESSAGE } from './move-abort';

// Shapes copied from real devnet aborts.
const bankrollRevoked =
  'MoveAbort(MoveLocation { module: ModuleId { address: bd90dbc51a4b00e1366ad864817d0611eac2b2df3190fdf0615b97ff60b60da1, name: Identifier("bankroll_pool") }, function: 12, instruction: 9, function_name: Some("collect_bet") }, 2) in command 1';
const minesTooLarge =
  'MoveAbort(MoveLocation { module: ModuleId { address: 1ba1065558e2495aec9d48e393f39d3086650013e68ef2ff498daa673d68faa4, name: Identifier("mines") }, function: 4, instruction: 16, function_name: Some("create_session") }, 7) in command 1';

describe('parseMoveAbort', () => {
  it('reads the module and code', () => {
    expect(parseMoveAbort(bankrollRevoked)).toEqual({ module: 'bankroll_pool', code: 2 });
    expect(parseMoveAbort(minesTooLarge)).toEqual({ module: 'mines', code: 7 });
  });

  it('returns null for anything else', () => {
    expect(parseMoveAbort('fetch failed')).toBeNull();
  });
});

describe('humanizeGameAbort', () => {
  const nm = { 2: 'Duplicate number in picks.' };

  it('does not read a bankroll code as a game code', () => {
    // The bug this replaces: bankroll 2 rendered as the game's own 2.
    expect(humanizeGameAbort(bankrollRevoked, 'numbermatch', nm)).toBe(STALE_PAGE_MESSAGE);
  });

  it('maps the game module through its own table', () => {
    expect(humanizeGameAbort(minesTooLarge, 'mines', { 7: 'too large' })).toBe('too large');
    expect(humanizeGameAbort(minesTooLarge, 'wheel', { 7: 'wrong' })).toBeNull();
  });
});
