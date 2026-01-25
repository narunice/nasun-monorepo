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
  package: '0x9984aab5fe518cf658532bf04e45b1eea075fe86ae62ad124bc3c8694f61dbb4',
  faucet: '0x802d91521fc5ba0e590330cb500eb1c0399c6209b6b1db1cffe41e101a82521f',
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
