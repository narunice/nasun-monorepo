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

// Tolerates the module name with or without quotes, which SDK versions differ on.
const ABORT_RE = /Identifier\("?(\w+)"?\)[\s\S]*?\},\s*(\d+)\)/;

export function parseMoveAbort(raw: string): MoveAbort | null {
  if (!raw.includes('MoveAbort')) return null;
  const m = ABORT_RE.exec(raw);
  return m ? { module: m[1]!, code: Number(m[2]) } : null;
}

/** An abort nobody has a message for. Never show the raw MoveAbort dump. */
export const GENERIC_ABORT_MESSAGE = 'The game contract rejected this transaction.';

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
 * Message for a MoveAbort: the mapped text for bankroll_pool or the calling
 * game module, GENERIC_ABORT_MESSAGE for any other abort, or null when `raw`
 * is not a MoveAbort at all so the caller can handle network and gas errors.
 */
export function humanizeGameAbort(
  raw: string,
  gameModule: string,
  gameMessages: Record<number, string>,
): string | null {
  if (!raw.includes('MoveAbort')) return null;
  const abort = parseMoveAbort(raw);
  if (abort?.module === 'bankroll_pool') return BANKROLL_ABORTS[abort.code] ?? GENERIC_ABORT_MESSAGE;
  if (abort?.module === gameModule) return gameMessages[abort.code] ?? GENERIC_ABORT_MESSAGE;
  return GENERIC_ABORT_MESSAGE;
}
