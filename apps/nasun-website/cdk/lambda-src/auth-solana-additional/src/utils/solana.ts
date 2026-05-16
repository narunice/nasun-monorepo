import nacl from 'tweetnacl';
import bs58 from 'bs58';

// Solana base58 address: 32-byte ed25519 public key encoded as base58 (32-44
// chars in practice). We validate by attempting bs58 decode + length check --
// this is the only way to be sure the input is a syntactically valid pubkey.
const SOL_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/**
 * Validate and normalize a Solana address. Returns the original (canonical)
 * base58 string if valid, otherwise null. Unlike EVM we do NOT lowercase --
 * base58 is case-sensitive and there is no checksum variant.
 */
export function toSolAddress(addr: string | undefined | null): string | null {
  if (!addr || typeof addr !== 'string') return null;
  if (!SOL_ADDRESS_RE.test(addr)) return null;
  try {
    const bytes = bs58.decode(addr);
    if (bytes.length !== 32) return null;
    return addr;
  } catch {
    return null;
  }
}

/** Case-sensitive equality. Solana addresses are case-sensitive. */
export function addrEq(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a === b;
}

/**
 * Verify an Ed25519 signature over the UTF-8 bytes of `message`. Caller MUST
 * verify that `publicKeyB58` equals the address the user asked to link before
 * calling, and MUST use the message string stored at challenge time (never one
 * supplied by the client).
 */
export function verifySolSignature(
  message: string,
  signatureB58: string,
  publicKeyB58: string,
): boolean {
  try {
    const messageBytes = new TextEncoder().encode(message);
    const sigBytes = bs58.decode(signatureB58);
    const pubBytes = bs58.decode(publicKeyB58);
    if (sigBytes.length !== 64) return false;
    if (pubBytes.length !== 32) return false;
    return nacl.sign.detached.verify(messageBytes, sigBytes, pubBytes);
  } catch (err) {
    console.error('Solana signature verification failed:', (err as Error)?.message);
    return false;
  }
}
