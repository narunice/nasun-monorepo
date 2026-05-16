import { verifyMessage, getAddress, isAddress } from 'ethers';

/**
 * Recover the signer of an EIP-191 personal_sign signature.
 * `verifyMessage` from ethers v6 returns a checksummed address — callers
 * compare via lowercase so casing differences in input do not matter.
 */
export async function verifySignature(
  message: string,
  signature: string
): Promise<string> {
  try {
    return verifyMessage(message, signature);
  } catch (error) {
    console.error('Signature verification failed:', error);
    throw new Error('Invalid signature format');
  }
}

/**
 * Validate and checksum-normalize a hex EVM address. Returns null if
 * input is not a syntactically valid 0x-prefixed 40-hex string.
 */
export function toChecksum(addr: string | undefined | null): string | null {
  if (!addr || typeof addr !== 'string') return null;
  if (!isAddress(addr)) return null;
  try {
    return getAddress(addr);
  } catch {
    return null;
  }
}

export function addrEq(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.toLowerCase() === b.toLowerCase();
}
