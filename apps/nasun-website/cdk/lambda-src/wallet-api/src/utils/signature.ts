import { verifyPersonalMessageSignature } from '@mysten/sui/verify';
import { Ed25519PublicKey } from '@mysten/sui/keypairs/ed25519';

/**
 * Verify a Sui personal message signature and return the signer's Sui address.
 * Uses @mysten/sui/verify, fully compatible with LocalSigner.signPersonal()
 * which internally calls keypair.signPersonalMessage() (includes BCS intent prefix).
 *
 * @param messageBytes - UTF-8 encoded message bytes
 * @param signature - Base64 encoded signature from signPersonal()
 * @returns Lowercase Sui address (0x + 64 hex chars)
 * @throws If the signature is invalid or cannot be verified
 */
export async function verifySuiPersonalSignature(
  messageBytes: Uint8Array,
  signature: string
): Promise<string> {
  const publicKey = await verifyPersonalMessageSignature(messageBytes, signature);
  return publicKey.toSuiAddress().toLowerCase();
}

/**
 * Verify a zkLogin ephemeral key signature.
 * ZkLoginSigner.signWithEphemeralKey() uses keypair.signPersonalMessage(),
 * signed with the ephemeral Ed25519 key (not the zkLogin Sui address key).
 * We verify the recovered public key matches the provided ephemeral public key.
 *
 * @param messageBytes - UTF-8 encoded message bytes
 * @param signature - Base64 signature from ZkLoginSigner.signWithEphemeralKey()
 * @param ephemeralPublicKeyBase64 - Base64 raw ephemeral public key
 * @returns true if the signature was made with the provided ephemeral key
 * @throws If the signature is invalid
 */
export async function verifyZkLoginEphemeralSignature(
  messageBytes: Uint8Array,
  signature: string,
  ephemeralPublicKeyBase64: string
): Promise<boolean> {
  const recoveredPublicKey = await verifyPersonalMessageSignature(messageBytes, signature);
  const recoveredAddress = recoveredPublicKey.toSuiAddress().toLowerCase();

  const ephemeralPubKeyBytes = Uint8Array.from(Buffer.from(ephemeralPublicKeyBase64, 'base64'));
  const ephemeralPubKey = new Ed25519PublicKey(ephemeralPubKeyBytes);
  const expectedAddress = ephemeralPubKey.toSuiAddress().toLowerCase();

  return recoveredAddress === expectedAddress;
}
