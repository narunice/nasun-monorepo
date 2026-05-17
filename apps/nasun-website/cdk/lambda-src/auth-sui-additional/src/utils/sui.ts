import { verifyPersonalMessageSignature } from '@mysten/sui/verify';

// Sui address = 0x + 64 lowercase hex chars (32 bytes). We canonicalize by
// lowercasing so storage + comparison are consistent regardless of how the
// wallet returned the address.
const SUI_ADDRESS_RE = /^0x[a-fA-F0-9]{64}$/;

/**
 * Validate and normalize a Sui address. Returns the lowercase canonical
 * form when valid, otherwise null.
 */
export function toSuiAddress(addr: string | undefined | null): string | null {
  if (!addr || typeof addr !== 'string') return null;
  if (!SUI_ADDRESS_RE.test(addr)) return null;
  return addr.toLowerCase();
}

/** Case-insensitive comparison after normalization. */
export function addrEq(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * Verify a Sui personal-message signature against the EXACT message stored at
 * challenge time. The signature itself carries the public key, so we recover
 * the signer's Sui address and check it matches the address the user asked
 * to link. Returns the recovered (canonical lowercase) address on success,
 * null otherwise.
 *
 * The caller MUST pass the message string from the nonce record, never one
 * supplied by the client.
 */
export async function verifySuiPersonalSignature(
  message: string,
  signature: string,
  expectedAddress: string,
): Promise<string | null> {
  try {
    const messageBytes = new TextEncoder().encode(message);
    const publicKey = await verifyPersonalMessageSignature(messageBytes, signature);
    const recovered = publicKey.toSuiAddress().toLowerCase();
    if (recovered !== expectedAddress.toLowerCase()) return null;
    return recovered;
  } catch (err) {
    console.error('Sui signature verification failed:', (err as Error)?.message);
    return null;
  }
}
