/**
 * Module-aware MoveAbort parsing for the game error humanizers.
 *
 * Abort codes are only unique within a module: bankroll_pool's 2 is
 * EGameCapRevoked while numbermatch's 2 is EDuplicateNumber. Matching the bare
 * `, N)` suffix mislabeled every bankroll abort a game transaction can hit, so
 * the module travels with the code here.
 */
export interface MoveAbort {
  module: string;
  code: number;
}

const ABORT_RE = /MoveAbort\(MoveLocation \{ module: ModuleId \{ address: \w+, name: Identifier\("(\w+)"\) \}[\s\S]*?\},\s*(\d+)\)/;

export function parseMoveAbort(raw: string): MoveAbort | null {
  const m = ABORT_RE.exec(raw);
  return m ? { module: m[1]!, code: Number(m[2]) } : null;
}

/** A game package the site no longer calls: a stale tab after an upgrade. */
export const STALE_PAGE_MESSAGE = 'This page is out of date. Refresh to continue.';

/**
 * The game's cap is revoked or missing. Usually a stale tab calling a retired
 * package, but it also happens on a current page when an operator pulls a
 * game, so it must not promise that a refresh fixes it.
 */
export const GAME_UNAVAILABLE_MESSAGE =
  'This game is unavailable right now. Refresh the page, and if it keeps happening, try again later.';

/** Every bankroll_pool abort code (bankroll_pool.move EInsufficientPoolBalance..EBelowAttributed). */
export const BANKROLL_ABORTS: Record<number, string> = {
  1: 'Bankroll pool is temporarily low. Try again shortly.',
  2: GAME_UNAVAILABLE_MESSAGE,
  3: 'Betting is paused right now. Try again later.',
  4: 'Withdraw cooldown is still active. Wait 24 hours after requesting.',
  5: 'Withdraw must be requested before redeeming liquidity.',
  6: 'Invalid amount.',
  7: 'This bet exceeds the maximum payout. Try a smaller bet.',
  8: 'Liquidity provided is below the minimum (10 NUSDC).',
  12: 'The bankroll is at capacity right now. Try a smaller bet or try again shortly.',
  13: 'This bet exceeds the maximum payout. Try a smaller bet.',
};

/**
 * Message for an abort in bankroll_pool or in the calling game module, or null
 * when it is neither, so the caller can fall through to its generic handling.
 */
export function humanizeGameAbort(
  raw: string,
  gameModule: string,
  gameMessages: Record<number, string>,
): string | null {
  const abort = parseMoveAbort(raw);
  if (!abort) return null;
  if (abort.module === 'bankroll_pool') return BANKROLL_ABORTS[abort.code] ?? null;
  if (abort.module === gameModule) return gameMessages[abort.code] ?? null;
  return null;
}
