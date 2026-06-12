// C3a signature verification -- ported verbatim from the login lambdas to preserve byte-exact parity.
// Sui: auth-sui/src/utils/sui.ts. EVM: auth-metamask/src/utils/ethereum.ts. SECURITY-CRITICAL: these
// recover the wallet identity from a signature, so the recovery semantics (BCS intent prefix for Sui,
// EIP-191 for EVM) MUST match the lambdas exactly. A test-vector parity gate (box == lambda recovered
// address) is mandatory before cutover.

import { verifyPersonalMessageSignature } from '@mysten/sui/verify';
import { Ed25519PublicKey } from '@mysten/sui/keypairs/ed25519';
import { verifyMessage } from 'ethers';

/**
 * Recover the signer's Sui address from a personal-message signature.
 * Mirror of auth-sui sui.ts:verifySuiPersonalSignature. verifyPersonalMessageSignature handles the
 * BCS intent prefix that keypair.signPersonalMessage() adds.
 * @returns lowercase Sui address (0x + 64 hex)
 * @throws if the signature is invalid / cannot be verified
 */
export async function verifySuiPersonalSignature(
  messageBytes: Uint8Array,
  signature: string,
): Promise<string> {
  const publicKey = await verifyPersonalMessageSignature(messageBytes, signature);
  return publicKey.toSuiAddress().toLowerCase();
}

/**
 * Verify a zkLogin ephemeral-key signature. Mirror of auth-sui sui.ts:verifyZkLoginEphemeralSignature.
 * ZkLoginSigner.signWithEphemeralKey() uses the same BCS prefix; we recover the ephemeral public key
 * and confirm it matches the claimed ephemeralPublicKey. Returns true iff they match.
 */
export async function verifyZkLoginEphemeralSignature(
  messageBytes: Uint8Array,
  signature: string,
  ephemeralPublicKeyBase64: string,
): Promise<boolean> {
  const recoveredPublicKey = await verifyPersonalMessageSignature(messageBytes, signature);
  const recoveredAddress = recoveredPublicKey.toSuiAddress().toLowerCase();

  const ephemeralPubKeyBytes = Uint8Array.from(Buffer.from(ephemeralPublicKeyBase64, 'base64'));
  const ephemeralPubKey = new Ed25519PublicKey(ephemeralPubKeyBytes);
  const expectedAddress = ephemeralPubKey.toSuiAddress().toLowerCase();

  return recoveredAddress === expectedAddress;
}

/**
 * Recover the signer's EVM address from an EIP-191 personal_sign signature.
 * Mirror of auth-metamask ethereum.ts:verifySignature (ethers verifyMessage).
 * @throws if the signature is malformed
 */
export async function verifyEvmSignature(message: string, signature: string): Promise<string> {
  try {
    return verifyMessage(message, signature);
  } catch {
    throw new Error('Invalid signature format');
  }
}
