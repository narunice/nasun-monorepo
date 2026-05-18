/**
 * Pure helpers for the TransferAgentFundsDialog amount and Max logic.
 *
 * Extracted so the validation rules that gate real on-chain transactions
 * (NASUN owner-side gas reserve on deposit, NASUN dust withdraw block,
 * mode-specific source-of-balance selection) are unit-testable without
 * mounting React, the wallet signer, or the Sui client.
 */

import { computeNasunMaxWithdraw } from '../services/agentWithdrawTx';

export type TransferMode = 'deposit' | 'withdraw-trading' | 'top-up-inference';

/** Owner must keep this much NASUN to sponsor the deposit tx itself when depositing NASUN. */
export const OWNER_NASUN_GAS_RESERVE_MIST = 50_000_000n;

/**
 * Parse a decimal display amount ("12.34") into a raw bigint at the token's
 * decimals. Invalid input (non-numeric, leading dot only) returns 0n. Used
 * by both the controlled input and the Max button.
 */
export function parseRawAmount(display: string, decimals: number): bigint {
  const trimmed = display.trim();
  if (!trimmed || !/^\d*\.?\d*$/.test(trimmed) || trimmed === '.') return 0n;
  const [whole = '0', frac = ''] = trimmed.split('.');
  const paddedFrac = (frac + '0'.repeat(decimals)).slice(0, decimals);
  try {
    return BigInt(whole) * (10n ** BigInt(decimals)) + BigInt(paddedFrac);
  } catch {
    return 0n;
  }
}

/** Inverse of parseRawAmount: format raw bigint into a decimal display string. */
export function formatRawAmount(raw: bigint, decimals: number): string {
  const divisor = 10n ** BigInt(decimals);
  const whole = raw / divisor;
  const frac = raw % divisor;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${whole}.${fracStr}`;
}

interface MaxForModeInput {
  mode: TransferMode;
  /** The coin actually being transferred this submission. top-up forces NUSDC. */
  effectiveCoin: 'NASUN' | 'NUSDC' | 'NBTC';
  /** Owner-side balance of the effective coin. */
  ownerSelectedRaw: bigint;
  /** Owner-side NUSDC balance (used by top-up-inference path). */
  ownerNusdcRaw: bigint;
  /** Agent-side NASUN balance (used by withdraw NASUN with gas reserve). */
  agentNasunRaw: bigint;
  /** Agent-side balance of the effective coin (used by withdraw non-NASUN). */
  agentSelectedRaw: bigint;
}

/**
 * Compute the maximum amount the user may submit for the given mode/coin.
 *
 * - deposit + NASUN: subtract OWNER_NASUN_GAS_RESERVE_MIST so the owner can
 *   still sponsor the deposit tx itself. Returns 0n when below reserve.
 * - deposit + other coin: full owner balance.
 * - top-up-inference: locked to NUSDC; full owner NUSDC balance.
 * - withdraw-trading + NASUN: defer to computeNasunMaxWithdraw which keeps
 *   the agent's own gas reserve.
 * - withdraw-trading + other coin: full agent balance.
 */
export function computeMaxForMode(input: MaxForModeInput): bigint {
  const { mode, effectiveCoin, ownerSelectedRaw, ownerNusdcRaw, agentNasunRaw, agentSelectedRaw } = input;

  if (mode === 'top-up-inference') return ownerNusdcRaw;

  if (mode === 'deposit') {
    if (effectiveCoin === 'NASUN') {
      return ownerSelectedRaw > OWNER_NASUN_GAS_RESERVE_MIST
        ? ownerSelectedRaw - OWNER_NASUN_GAS_RESERVE_MIST
        : 0n;
    }
    return ownerSelectedRaw;
  }

  // withdraw-trading
  if (effectiveCoin === 'NASUN') return computeNasunMaxWithdraw(agentNasunRaw);
  return agentSelectedRaw;
}
