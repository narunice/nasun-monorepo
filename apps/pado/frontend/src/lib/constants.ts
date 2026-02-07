/**
 * Shared constants for Pado frontend
 */

// Delay after transaction to wait for RPC node to index new objects
export const RPC_SYNC_DELAY_MS = 2000;

// Delay for UI syncing indicator after a successful transaction
export const TX_SYNC_DELAY_MS = 1500;

// Buffer multiplier for auto-deposit calculations (5% extra)
export const DEPOSIT_BUFFER_MULTIPLIER = 1.05;

// Slippage buffer for market order price estimation (10% above oracle price)
export const MARKET_ORDER_SLIPPAGE_BUFFER = 1.10;
