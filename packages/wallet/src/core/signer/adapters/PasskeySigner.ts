/**
 * PasskeySigner - Ed25519 Keypair based signer for passkey wallets
 *
 * Wraps Ed25519Keypair derived from WebAuthn passkey authentication.
 * Functionally identical to LocalSigner but with distinct SignerType
 * to allow separate registration and priority in SignerManager.
 */

import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import type { SignerAdapter, SignerCapabilities, SignatureResult } from '../types';
import { DEFAULT_CAPABILITIES } from '../types';

export class PasskeySigner implements SignerAdapter {
  readonly type = 'passkey' as const;
  readonly address: string;
  readonly capabilities: SignerCapabilities = {
    ...DEFAULT_CAPABILITIES,
  };

  private keypair: Ed25519Keypair;

  /**
   * Create a PasskeySigner from an Ed25519Keypair
   * @param keypair - The Ed25519 keypair derived from passkey authentication
   * @param address - Wallet address (defaults to Sui address from keypair)
   */
  constructor(keypair: Ed25519Keypair, address?: string) {
    this.keypair = keypair;
    this.address = address ?? keypair.toSuiAddress();
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
   * Get the underlying Ed25519 keypair
   *
   * Use with caution - exposes the private key.
   * Required for operations that need direct keypair access.
   */
  getKeypair(): Ed25519Keypair {
    return this.keypair;
  }
}
