/**
 * Map Move abort errors from the gostop lottery module into user-friendly
 * messages. Source: apps/gostop/contracts-lottery/sources/lottery.move
 *
 * Sui returns errors like:
 *   "MoveAbort(MoveLocation { module: ModuleId { ... name: Identifier(\"lottery\") } ..., 21) in command 0"
 * The trailing integer (here `21`) is the abort code we map.
 */

import { humanizeGameAbort } from '../../lib/move-abort'

const LOTTERY_ABORT_MAP: Record<number, string> = {
  0: 'Round is not open for ticket purchases.',
  1: 'Round must be closed before this action.',
  2: 'Round must be drawn before this action.',
  4: 'Selected numbers are invalid.',
  5: 'Duplicate numbers detected. Pick five distinct numbers.',
  7: 'Prize already claimed for this ticket.',
  8: 'This ticket is not a winner.',
  9: 'You have reached the per-address ticket limit (500 per round).',
  10: 'Insufficient NUSDC balance for this purchase.',
  11: 'Ticket does not belong to this round.',
  12: 'Round is not yet settled.',
  13: 'Number is out of range. Use 1 to 25.',
  14: 'Wrong number count. Pick exactly five numbers.',
  15: 'Round has expired.',
  16: 'Round close time has not been reached yet.',
  17: 'Round draw time has not been reached yet.',
  18: 'This ticket did not win a prize.',
  19: 'Source round must be settled before transferring rollover.',
  20: 'Target round must be open to receive rollover.',
  21: 'Claim window has expired. Prize is forfeited.',
  22: 'Claim window has not yet ended.',
  23: 'Close time cannot be in the past.',
  24: 'Draw time must be at or after close time.',
  25: 'Draw time is too far after close time.',
  26: 'GameCap is already installed.',
  27: 'GameCap is not installed.',
  28: 'GameCap does not match this game.',
}


/**
 * Best-effort parse of a Sui transaction error string into something users
 * can act on. Falls back to the raw message if no pattern matches.
 */
export function humanizeLotteryError(rawMessage: string): string {
  if (!rawMessage) return 'Transaction failed.'

  // Network glitches first. Devnet reboots/RPC lag surface as object-version
  // mismatches; phrase as a hiccup so users just retry instead of debugging.
  if (/not available for consumption|ObjectVersionUnavailable|current version:/i.test(rawMessage)) {
    return 'Devnet hiccup. Give it a moment and try again.'
  }
  if (/Transaction is rejected as invalid by more than 1\/3 of validators/i.test(rawMessage)) {
    return 'Devnet hiccup. Give it a moment and try again.'
  }
  if (/InsufficientGas|gas budget|GasBalanceTooLow|Balance of gas object.*lower than the needed amount/i.test(rawMessage)) {
    return 'Not enough NASUN for gas. Please top up your wallet and try again.'
  }

  const abort = humanizeGameAbort(rawMessage, 'lottery', LOTTERY_ABORT_MAP)
  if (abort) return abort

  // Direct number-only fallback (some SDK versions strip the module name).
  // Only when the module is genuinely missing: with a module present, a bare
  // code match would read another module's code (bankroll_pool's) as ours.
  const codeOnly = /Identifier\(/.test(rawMessage) ? null : rawMessage.match(/abort.*?,\s*(\d+)\s*\)/i)
  if (codeOnly) {
    const code = Number(codeOnly[1])
    if (code in LOTTERY_ABORT_MAP) return LOTTERY_ABORT_MAP[code]
  }

  return rawMessage
}
