/**
 * EVM Ledger Client Wrapper
 *
 * Wraps @ledgerhq/hw-app-eth for Ethereum/EVM chain signing.
 * Uses secp256k1 curve for EVM address derivation.
 */

import {
  LedgerError,
  LEDGER_DERIVATION_PATHS,
  type LedgerTransport,
  type LedgerAddressResult,
  type EvmLedgerClientInterface,
} from './types';
import { parseLedgerError } from './transport';

/**
 * Create an EVM Ledger client
 *
 * @param transport - Ledger transport
 * @returns EVM Ledger client instance
 */
export async function createEvmLedgerClient(
  transport: LedgerTransport
): Promise<EvmLedgerClientInterface> {
  try {
    // Dynamic import to reduce bundle size
    const Eth = (await import('@ledgerhq/hw-app-eth')).default;
    return new Eth(transport as unknown as Parameters<typeof Eth>[0]);
  } catch (error) {
    throw new LedgerError(
      'Failed to initialize Ethereum Ledger app. Please ensure the Ethereum app is installed.',
      'APP_NOT_OPEN',
      error
    );
  }
}

/**
 * Get EVM address from Ledger device
 *
 * @param client - EVM Ledger client
 * @param accountIndex - Account index (0-based)
 * @returns Address result with address, public key, and derivation path
 */
export async function getEvmAddress(
  client: EvmLedgerClientInterface,
  accountIndex = 0
): Promise<LedgerAddressResult> {
  const derivationPath = LEDGER_DERIVATION_PATHS.EVM(accountIndex);

  try {
    // getAddress returns checksummed address
    const { address, publicKey } = await client.getAddress(derivationPath);

    return {
      address,
      publicKey,
      derivationPath,
    };
  } catch (error) {
    throw parseLedgerError(error);
  }
}

/**
 * Sign an EVM transaction with Ledger
 *
 * @param client - EVM Ledger client
 * @param rawTxHex - RLP-encoded unsigned transaction in hex (without 0x prefix)
 * @param derivationPath - BIP44 derivation path
 * @returns Signature components (v, r, s)
 */
export async function signEvmTransaction(
  client: EvmLedgerClientInterface,
  rawTxHex: string,
  derivationPath: string
): Promise<{ v: string; r: string; s: string }> {
  try {
    // Remove 0x prefix if present
    const txHex = rawTxHex.startsWith('0x') ? rawTxHex.slice(2) : rawTxHex;

    const { v, r, s } = await client.signTransaction(derivationPath, txHex);

    return { v, r, s };
  } catch (error) {
    throw parseLedgerError(error);
  }
}

/**
 * Sign a personal message with Ledger (EIP-191)
 *
 * @param client - EVM Ledger client
 * @param message - Message bytes to sign
 * @param derivationPath - BIP44 derivation path
 * @returns Signature in hex format (0x...)
 */
export async function signEvmPersonalMessage(
  client: EvmLedgerClientInterface,
  message: Uint8Array,
  derivationPath: string
): Promise<string> {
  try {
    // Convert message to hex without 0x prefix
    const messageHex = Buffer.from(message).toString('hex');

    const { v, r, s } = await client.signPersonalMessage(derivationPath, messageHex);

    // Combine v, r, s into a single signature
    // v is already adjusted for EIP-155 by the Ledger
    const vHex = (v + 27).toString(16).padStart(2, '0');
    return '0x' + r + s + vHex;
  } catch (error) {
    throw parseLedgerError(error);
  }
}

/**
 * Format EVM transaction signature for broadcasting
 *
 * @param v - Recovery parameter
 * @param r - ECDSA r value
 * @param s - ECDSA s value
 * @returns Combined signature in hex format
 */
export function formatEvmSignature(v: string, r: string, s: string): string {
  // Ensure proper hex formatting
  const rHex = r.startsWith('0x') ? r.slice(2) : r;
  const sHex = s.startsWith('0x') ? s.slice(2) : s;
  const vHex = v.startsWith('0x') ? v.slice(2) : v;

  return '0x' + rHex + sHex + vHex;
}

/**
 * Parse v value from Ledger response for EIP-155 compatibility
 *
 * @param vString - v value from Ledger
 * @param chainId - Chain ID for EIP-155
 * @returns Adjusted v value
 */
export function parseVValue(vString: string, chainId: number): number {
  const v = parseInt(vString, 16);

  // EIP-155: v = chainId * 2 + 35 or chainId * 2 + 36
  // For legacy (pre-EIP-155): v = 27 or 28
  if (v === 0 || v === 1) {
    // Legacy format - add 27
    return v + 27;
  }

  // Already in EIP-155 format
  return v;
}
