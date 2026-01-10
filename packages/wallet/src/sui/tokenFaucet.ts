/**
 * Token Faucet - NBTC/NUSDC Faucet Transaction Builders
 *
 * Provides transaction builders for requesting test tokens on Nasun Devnet.
 * These tokens use a Move smart contract faucet that requires wallet signing.
 */

import { Transaction } from '@mysten/sui/transactions';
import type { TokenFaucetHandler } from '../types';

// Devnet Token Faucet Configuration
// These are the deployed contract addresses on Nasun Devnet
export const DEVNET_TOKEN_FAUCET = {
  package: '0x508ba1bda666f93e72543ebcce14075d08ac089c455fca51592bc1ef1c826489',
  faucet: '0x5930a54235a835a9d93c6e42d049c5da42255fca0b40199352cfc72fd23fdf5e',
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
