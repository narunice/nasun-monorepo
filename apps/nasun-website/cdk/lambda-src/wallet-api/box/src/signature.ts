// Sui signature verification for the address-book challenge/verify flow. Ported verbatim from the wallet-api
// lambda utils/signature.ts (@mysten/sui/verify) so the box accepts byte-identical signatures: zkLogin
// ephemeral-key personal-message signatures and self-custody personal-message signatures.

import { verifyPersonalMessageSignature } from '@mysten/sui/verify';
import { Ed25519PublicKey } from '@mysten/sui/keypairs/ed25519';

/**
 * Verify a Sui personal message signature and return the signer's Sui address (lowercase).
 * Compatible with LocalSigner.signPersonal() (keypair.signPersonalMessage, includes BCS intent prefix).
 */
export async function verifySuiPersonalSignature(
  messageBytes: Uint8Array,
  signature: string,
): Promise<string> {
  const publicKey = await verifyPersonalMessageSignature(messageBytes, signature);
  return publicKey.toSuiAddress().toLowerCase();
}

/**
 * Verify a zkLogin ephemeral-key signature: recover the public key from the personal-message signature and
 * confirm it matches the provided ephemeral public key (i.e. the signature was made with that ephemeral key).
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
