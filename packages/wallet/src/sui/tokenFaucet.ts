/**
 * Token Faucet - Transaction Builders for all devnet tokens
 *
 * Provides transaction builders for requesting test tokens on Nasun Devnet.
 * All faucet functions use rate-limited (_with_cooldown) variants
 * enforced by the Move smart contract (24h cooldown per address).
 *
 * V1 tokens (NBTC/NUSDC) use PerTokenClaimRecord for independent cooldowns.
 * V2 tokens (NETH/NSOL) have separate packages with independent cooldowns.
 */

import {
  TOKENS_PACKAGE_ID, TOKEN_FAUCET, PER_TOKEN_CLAIM_RECORD,
  NETH_PACKAGE_ID, NETH_FAUCET_V2, NETH_CLAIM_RECORD_V2,
  TOKENS_V2_PACKAGE_ID, TOKEN_FAUCET_V2, CLAIM_RECORD_V2,
} from '@nasun/devnet-config';
import { Transaction } from '@mysten/sui/transactions';
import type { TokenFaucetHandler } from '../types';
import { getCooldownRemaining } from './faucetCooldown';

const CLOCK_ID = '0x6';

// Devnet Token Faucet Configuration (V1)
export const DEVNET_TOKEN_FAUCET = {
  package: TOKENS_PACKAGE_ID,
  faucet: TOKEN_FAUCET,
  perTokenClaimRecord: PER_TOKEN_CLAIM_RECORD,
};

/**
 * Build transaction to request NBTC only (24h independent cooldown).
 * Uses PerTokenClaimRecord — does NOT affect NUSDC cooldown.
 */
export function buildNbtcFaucetTx(): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${DEVNET_TOKEN_FAUCET.package}::faucet::request_nbtc_individual`,
    arguments: [
      tx.object(DEVNET_TOKEN_FAUCET.faucet),
      tx.object(DEVNET_TOKEN_FAUCET.perTokenClaimRecord),
      tx.object(CLOCK_ID),
    ],
  });

  return tx;
}

/**
 * Build transaction to request NUSDC only (24h independent cooldown).
 * Uses PerTokenClaimRecord — does NOT affect NBTC cooldown.
 */
export function buildNusdcFaucetTx(): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${DEVNET_TOKEN_FAUCET.package}::faucet::request_nusdc_individual`,
    arguments: [
      tx.object(DEVNET_TOKEN_FAUCET.faucet),
      tx.object(DEVNET_TOKEN_FAUCET.perTokenClaimRecord),
      tx.object(CLOCK_ID),
    ],
  });

  return tx;
}

/**
 * Build transaction to request NETH from V2 faucet (24h cooldown)
 */
export function buildNethFaucetTx(): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${NETH_PACKAGE_ID}::faucet_v2::request_neth_with_cooldown`,
    arguments: [
      tx.object(NETH_FAUCET_V2),
      tx.object(NETH_CLAIM_RECORD_V2),
      tx.object(CLOCK_ID),
    ],
  });

  return tx;
}

/**
 * Build transaction to request NSOL from V2 faucet (24h cooldown)
 */
export function buildNsolFaucetTx(): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${TOKENS_V2_PACKAGE_ID}::faucet_v2::request_nsol_with_cooldown`,
    arguments: [
      tx.object(TOKEN_FAUCET_V2),
      tx.object(CLAIM_RECORD_V2),
      tx.object(CLOCK_ID),
    ],
  });

  return tx;
}

// ============================================
// Batch PTB Builder
// ============================================

/** MoveCall appenders for each on-chain faucet token (excludes NSN which is HTTP) */
const FAUCET_MOVE_CALLS: Record<string, (tx: Transaction) => void> = {
  NBTC: (tx) => {
    tx.moveCall({
      target: `${DEVNET_TOKEN_FAUCET.package}::faucet::request_nbtc_individual`,
      arguments: [
        tx.object(DEVNET_TOKEN_FAUCET.faucet),
        tx.object(DEVNET_TOKEN_FAUCET.perTokenClaimRecord),
        tx.object(CLOCK_ID),
      ],
    });
  },
  NUSDC: (tx) => {
    tx.moveCall({
      target: `${DEVNET_TOKEN_FAUCET.package}::faucet::request_nusdc_individual`,
      arguments: [
        tx.object(DEVNET_TOKEN_FAUCET.faucet),
        tx.object(DEVNET_TOKEN_FAUCET.perTokenClaimRecord),
        tx.object(CLOCK_ID),
      ],
    });
  },
  NETH: (tx) => {
    tx.moveCall({
      target: `${NETH_PACKAGE_ID}::faucet_v2::request_neth_with_cooldown`,
      arguments: [
        tx.object(NETH_FAUCET_V2),
        tx.object(NETH_CLAIM_RECORD_V2),
        tx.object(CLOCK_ID),
      ],
    });
  },
  NSOL: (tx) => {
    tx.moveCall({
      target: `${TOKENS_V2_PACKAGE_ID}::faucet_v2::request_nsol_with_cooldown`,
      arguments: [
        tx.object(TOKEN_FAUCET_V2),
        tx.object(CLAIM_RECORD_V2),
        tx.object(CLOCK_ID),
      ],
    });
  },
};

/** All on-chain faucet token symbols (excludes NSN which uses HTTP API) */
export const ONCHAIN_FAUCET_SYMBOLS = Object.keys(FAUCET_MOVE_CALLS);

/**
 * Build a single PTB that claims multiple tokens at once.
 * Avoids gas coin contention by combining all moveCall into one transaction.
 *
 * @param symbols - Token symbols to include (e.g., ['NBTC', 'NUSDC', 'NETH', 'NSOL'])
 * @returns Transaction with all faucet moveCall commands, or null if no valid symbols
 */
export function buildBatchFaucetTx(symbols: string[]): Transaction | null {
  const validSymbols = symbols.filter((s) => s in FAUCET_MOVE_CALLS);
  if (validSymbols.length === 0) return null;

  const tx = new Transaction();
  for (const symbol of validSymbols) {
    FAUCET_MOVE_CALLS[symbol](tx);
  }
  return tx;
}

// ============================================
// Faucet handlers for wallet-ui TokenFaucetButton
// ============================================
export const nbtcFaucetHandler: TokenFaucetHandler = {
  buildTransaction: buildNbtcFaucetTx,
  successMessage: '0.1 NBTC received!',
  getCooldownRemaining: (address: string) => getCooldownRemaining(address, 'NBTC'),
};
export const nusdcFaucetHandler: TokenFaucetHandler = {
  buildTransaction: buildNusdcFaucetTx,
  successMessage: '10,000 NUSDC received!',
  getCooldownRemaining: (address: string) => getCooldownRemaining(address, 'NUSDC'),
};
export const nethFaucetHandler: TokenFaucetHandler = {
  buildTransaction: buildNethFaucetTx,
  successMessage: '2.5 NETH received!',
  getCooldownRemaining: (address: string) => getCooldownRemaining(address, 'NETH'),
};
export const nsolFaucetHandler: TokenFaucetHandler = {
  buildTransaction: buildNsolFaucetTx,
  successMessage: '50 NSOL received!',
  getCooldownRemaining: (address: string) => getCooldownRemaining(address, 'NSOL'),
};
