/**
 * Ethereum Signature Verification Utilities
 *
 * MetaMask 서명 검증을 위한 유틸리티 함수들
 */

import { ethers } from 'ethers';

/**
 * Verify Ethereum signature
 *
 * @param message - Original message that was signed
 * @param signature - Hex signature from MetaMask
 * @param expectedAddress - Expected signer address
 * @returns true if signature is valid and matches expected address
 *
 * @example
 * const message = "Unlink MetaMask wallet: 0x123...\nNonce: abc123";
 * const signature = "0x..."; // from MetaMask
 * const isValid = await verifySignature(message, signature, "0x123...");
 */
export async function verifySignature(
  message: string,
  signature: string,
  expectedAddress: string
): Promise<boolean> {
  try {
    // Recover the address from the signature
    const recoveredAddress = ethers.verifyMessage(message, signature);

    // Compare with expected address (case-insensitive)
    const isValid = recoveredAddress.toLowerCase() === expectedAddress.toLowerCase();

    if (!isValid) {
      console.warn('Signature verification failed:', {
        expectedAddress: expectedAddress.toLowerCase(),
        recoveredAddress: recoveredAddress.toLowerCase(),
      });
    }

    return isValid;
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}

/**
 * Generate message for MetaMask unlink
 *
 * @param walletAddress - Wallet address to unlink
 * @param nonce - Unique nonce for this request
 * @returns Message string to be signed
 */
export function generateUnlinkMessage(walletAddress: string, nonce: string): string {
  return `Unlink MetaMask wallet: ${walletAddress}\nNonce: ${nonce}`;
}
