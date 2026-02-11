/**
 * Token Faucet - Transaction Builders for all devnet tokens
 *
 * Provides transaction builders for requesting test tokens on Nasun Devnet.
 * All faucet functions use rate-limited (_with_cooldown) variants
 * enforced by the Move smart contract (24h cooldown per address).
 */

import {
  TOKENS_PACKAGE_ID, TOKEN_FAUCET, CLAIM_RECORD,
  NETH_PACKAGE_ID, NETH_FAUCET_V2, NETH_CLAIM_RECORD_V2,
  TOKENS_V2_PACKAGE_ID, TOKEN_FAUCET_V2, CLAIM_RECORD_V2,
} from '@nasun/devnet-config';
import { Transaction } from '@mysten/sui/transactions';
import type { TokenFaucetHandler } from '../types';

const CLOCK_ID = '0x6';

// Devnet Token Faucet Configuration (V1)
// IDs are imported from @nasun/devnet-config for centralized management
export const DEVNET_TOKEN_FAUCET = {
  package: TOKENS_PACKAGE_ID,
  faucet: TOKEN_FAUCET,
  claimRecord: CLAIM_RECORD,
};

/**
 * Build transaction to request NBTC from faucet (24h cooldown)
 */
export function buildNbtcFaucetTx(): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${DEVNET_TOKEN_FAUCET.package}::faucet::request_nbtc_with_cooldown`,
    arguments: [
      tx.object(DEVNET_TOKEN_FAUCET.faucet),
      tx.object(DEVNET_TOKEN_FAUCET.claimRecord),
      tx.object(CLOCK_ID),
    ],
  });

  return tx;
}

/**
 * Build transaction to request NUSDC from faucet (24h cooldown)
 */
export function buildNusdcFaucetTx(): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${DEVNET_TOKEN_FAUCET.package}::faucet::request_nusdc_with_cooldown`,
    arguments: [
      tx.object(DEVNET_TOKEN_FAUCET.faucet),
      tx.object(DEVNET_TOKEN_FAUCET.claimRecord),
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

// Faucet handlers for wallet-ui TokenFaucetButton
export const nbtcFaucetHandler: TokenFaucetHandler = { buildTransaction: buildNbtcFaucetTx };
export const nusdcFaucetHandler: TokenFaucetHandler = { buildTransaction: buildNusdcFaucetTx };
export const nethFaucetHandler: TokenFaucetHandler = { buildTransaction: buildNethFaucetTx };
export const nsolFaucetHandler: TokenFaucetHandler = { buildTransaction: buildNsolFaucetTx };
