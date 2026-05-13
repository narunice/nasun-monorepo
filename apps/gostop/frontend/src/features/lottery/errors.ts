/**
 * Map Move abort errors from the gostop lottery module into user-friendly
 * messages. Source: apps/gostop/contracts-lottery/sources/lottery.move
 *
 * Sui returns errors like:
 *   "MoveAbort(MoveLocation { module: ModuleId { ... name: Identifier(\"lottery\") } ..., 21) in command 0"
 * The trailing integer (here `21`) is the abort code we map.
 */

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

const BANKROLL_ABORT_MAP: Record<number, string> = {
  1: 'Bankroll pool is paused.',
  2: 'Withdraw must be requested before redeeming liquidity.',
  3: 'Withdraw cooldown is still active. Wait 24 hours after requesting.',
  4: 'Liquidity provided is below the minimum (10 NUSDC).',
  5: 'Insufficient liquidity in the pool.',
  6: 'Payout exceeds the per-call cap for this game.',
  7: 'GameCap has been revoked.',
  8: 'GameCap mismatch.',
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

  // MoveAbort(... , N) in command M — two patterns cover known SDK serialization formats
  const m = rawMessage.match(/MoveAbort.*?(\w+)\s*"\s*\}.*?,\s*(\d+)\s*\)/i)
    || rawMessage.match(/Identifier\("?(\w+)"?\).*?,\s*(\d+)\s*\)/i)
  if (m) {
    const moduleName = m[1].toLowerCase()
    const code = Number(m[2])
    const map = moduleName.includes('bankroll') ? BANKROLL_ABORT_MAP : LOTTERY_ABORT_MAP
    if (code in map) return map[code]
  }

  // Direct number-only fallback (some SDK versions strip the module name).
  const codeOnly = rawMessage.match(/abort.*?,\s*(\d+)\s*\)/i)
  if (codeOnly) {
    const code = Number(codeOnly[1])
    if (code in LOTTERY_ABORT_MAP) return LOTTERY_ABORT_MAP[code]
  }

  return rawMessage
}
