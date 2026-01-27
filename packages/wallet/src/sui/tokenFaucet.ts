/**
 * Token Faucet - NBTC/NUSDC Faucet Transaction Builders
 *
 * Provides transaction builders for requesting test tokens on Nasun Devnet.
 * These tokens use a Move smart contract faucet that requires wallet signing.
 */

import { TOKENS_PACKAGE_ID, TOKEN_FAUCET } from '@nasun/devnet-config';
import { Transaction } from '@mysten/sui/transactions';
import type { TokenFaucetHandler } from '../types';

// Devnet Token Faucet Configuration
// IDs are imported from @nasun/devnet-config for centralized management
export const DEVNET_TOKEN_FAUCET = {
  package: TOKENS_PACKAGE_ID,
  faucet: TOKEN_FAUCET,
};

/**
 * Build transaction to request NBTC from faucet
 */
export function buildNbtcFaucetTx(): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${DEVNET_TOKEN_FAUCET.package}::faucet::request_nbtc`,
    arguments: [tx.object(DEVNET_TOKEN_FAUCET.faucet)],
  });

  return tx;
}

/**
 * Build transaction to request NUSDC from faucet
 */
export function buildNusdcFaucetTx(): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${DEVNET_TOKEN_FAUCET.package}::faucet::request_nusdc`,
    arguments: [tx.object(DEVNET_TOKEN_FAUCET.faucet)],
  });

  return tx;
}

/**
 * NBTC Faucet Handler
 * Uses buildTransaction for Move contract-based faucet
 */
export const nbtcFaucetHandler: TokenFaucetHandler = {
  buildTransaction: buildNbtcFaucetTx,
};

/**
 * NUSDC Faucet Handler
 * Uses buildTransaction for Move contract-based faucet
 */
export const nusdcFaucetHandler: TokenFaucetHandler = {
  buildTransaction: buildNusdcFaucetTx,
};
