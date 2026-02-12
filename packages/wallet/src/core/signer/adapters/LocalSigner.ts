/**
 * LocalSigner - Ed25519 Keypair based signer
 *
 * Wraps existing Ed25519Keypair for the SignerAdapter interface.
 * This is the default signer for traditional wallet flows.
 */

import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import type { SignerAdapter, SignerCapabilities, SignatureResult } from '../types';
import { DEFAULT_CAPABILITIES } from '../types';

export class LocalSigner implements SignerAdapter {
  readonly type = 'local' as const;
  readonly address: string;
  readonly capabilities: SignerCapabilities = {
    ...DEFAULT_CAPABILITIES,
  };

  private keypair: Ed25519Keypair;

  /**
   * Create a LocalSigner from an Ed25519Keypair
   * @param keypair - The Ed25519 keypair to use for signing
   * @param addressOverride - Chain-specific address (for non-Sui hash schemes like IOTA BLAKE2b-256)
   */
  constructor(keypair: Ed25519Keypair, addressOverride?: string) {
    this.keypair = keypair;
    this.address = addressOverride ?? keypair.toSuiAddress();
  }

  /**
   * Sign a transaction
   * @param txBytes - Serialized transaction bytes
   * @returns Signature result with base64 signature
   */
  async sign(txBytes: Uint8Array): Promise<SignatureResult> {
    const result = await this.keypair.signTransaction(txBytes);
    return {
      signature: result.signature,
    };
  }

  /**
   * Sign a personal message
   * @param message - Message bytes to sign
   * @returns Signature result with base64 signature
   */
  async signPersonal(message: Uint8Array): Promise<SignatureResult> {
    const result = await this.keypair.signPersonalMessage(message);
    return {
      signature: result.signature,
    };
  }

  /**
   * Get the public key as hex string
   */
  getPublicKey(): string {
    return this.keypair.getPublicKey().toBase64();
  }

  /**
   * Get the underlying Ed25519 keypair
   *
   * Use with caution - exposes the private key.
   * Required for operations that need direct keypair access.
   */
  getKeypair(): Ed25519Keypair {
    return this.keypair;
  }
}
