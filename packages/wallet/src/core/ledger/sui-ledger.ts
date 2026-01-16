/**
 * Sui Ledger Client Wrapper
 *
 * Wraps @mysten/ledgerjs-hw-app-sui for Sui/Move chain signing.
 * Uses Ed25519 curve for Sui address derivation.
 */

import { Ed25519PublicKey } from '@mysten/sui/keypairs/ed25519';
import {
  LedgerError,
  LEDGER_DERIVATION_PATHS,
  type LedgerTransport,
  type LedgerAddressResult,
  type SuiLedgerClientInterface,
} from './types';
import { parseLedgerError } from './transport';

/**
 * Create a Sui Ledger client
 *
 * @param transport - Ledger transport
 * @returns Sui Ledger client instance
 */
export async function createSuiLedgerClient(
  transport: LedgerTransport
): Promise<SuiLedgerClientInterface> {
  try {
    // Dynamic import to reduce bundle size
    const SuiLedgerClient = (await import('@mysten/ledgerjs-hw-app-sui')).default;
    return new SuiLedgerClient(transport as unknown as ConstructorParameters<typeof SuiLedgerClient>[0]);
  } catch (error) {
    throw new LedgerError(
      'Failed to initialize Sui Ledger app. Please ensure the Sui app is installed.',
      'APP_NOT_OPEN',
      error
    );
  }
}

/**
 * Derive Sui address from Ed25519 public key
 *
 * Uses the @mysten/sui SDK to derive the address from the public key.
 * The SDK handles the proper Blake2b hashing with signature scheme flag.
 *
 * @param publicKey - Raw Ed25519 public key bytes (32 bytes)
 * @returns Sui address in hex format (0x...)
 */
export function deriveSuiAddress(publicKey: Uint8Array): string {
  // Create Ed25519PublicKey from raw bytes
  const ed25519PubKey = new Ed25519PublicKey(publicKey);

  // Use SDK's toSuiAddress which handles Blake2b hashing
  return ed25519PubKey.toSuiAddress();
}

/**
 * Get Sui address from Ledger device
 *
 * @param client - Sui Ledger client
 * @param accountIndex - Account index (0-based)
 * @returns Address result with address, public key, and derivation path
 */
export async function getSuiAddress(
  client: SuiLedgerClientInterface,
  accountIndex = 0
): Promise<LedgerAddressResult> {
  const derivationPath = LEDGER_DERIVATION_PATHS.SUI(accountIndex);

  try {
    const { publicKey } = await client.getPublicKey(derivationPath);

    const address = deriveSuiAddress(publicKey);

    return {
      address,
      publicKey: Buffer.from(publicKey).toString('base64'),
      derivationPath,
    };
  } catch (error) {
    throw parseLedgerError(error);
  }
}

/**
 * Sign a Sui transaction with Ledger
 *
 * @param client - Sui Ledger client
 * @param txBytes - Transaction bytes to sign
 * @param derivationPath - BIP44 derivation path
 * @returns Signature in base64 format
 */
export async function signSuiTransaction(
  client: SuiLedgerClientInterface,
  txBytes: Uint8Array,
  derivationPath: string
): Promise<string> {
  try {
    const { signature } = await client.signTransaction(derivationPath, txBytes);

    // Sui signature format: flag (1 byte) + signature (64 bytes) + public key (32 bytes)
    // For Ledger, we get raw Ed25519 signature, need to format it properly
    // The SDK handles the final formatting when executing
    return Buffer.from(signature).toString('base64');
  } catch (error) {
    throw parseLedgerError(error);
  }
}

/**
 * Sign a personal message with Ledger (if supported)
 *
 * Note: Not all versions of the Sui Ledger app support personal message signing.
 *
 * @param client - Sui Ledger client
 * @param message - Message bytes to sign
 * @param derivationPath - BIP44 derivation path
 * @returns Signature in base64 format
 */
export async function signSuiPersonalMessage(
  client: SuiLedgerClientInterface,
  message: Uint8Array,
  derivationPath: string
): Promise<string> {
  try {
    // Check if the client supports personal message signing
    if (!client.signPersonalMessage) {
      throw new LedgerError(
        'Personal message signing is not supported by this Ledger app version',
        'UNSUPPORTED_OPERATION'
      );
    }

    const { signature } = await client.signPersonalMessage(derivationPath, message);
    return Buffer.from(signature).toString('base64');
  } catch (error) {
    if (error instanceof LedgerError) throw error;
    throw parseLedgerError(error);
  }
}
