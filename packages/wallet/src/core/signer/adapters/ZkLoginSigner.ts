/**
 * ZkLoginSigner - zkLogin based signer
 *
 * Wraps zkLogin state for the SignerAdapter interface.
 * Uses OAuth + ZK proof for transaction signing.
 */

import type { SignerAdapter, SignerCapabilities, SignatureResult } from '../types';
import type { ZkLoginState } from '../../../types/zklogin';
import { signWithZkLogin, signPersonalWithZkLogin } from '../../zklogin';
import { DEFAULT_CAPABILITIES } from '../types';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';

export class ZkLoginSigner implements SignerAdapter {
  readonly type = 'zklogin' as const;
  readonly address: string;
  readonly capabilities: SignerCapabilities = {
    ...DEFAULT_CAPABILITIES,
  };

  private zkState: ZkLoginState;
  private _ephemeralKeypair: Ed25519Keypair | null = null;

  /**
   * Create a ZkLoginSigner from zkLogin state
   * @param zkState - Complete zkLogin state after successful authentication
   */
  constructor(zkState: ZkLoginState) {
    if (!zkState.proof) {
      throw new Error('ZkLoginSigner requires a valid ZK proof');
    }
    this.zkState = zkState;
    this.address = zkState.address;
  }

  private getEphemeralKeypair(): Ed25519Keypair {
    if (!this._ephemeralKeypair) {
      const { secretKey } = decodeSuiPrivateKey(this.zkState.ephemeralPrivateKey);
      this._ephemeralKeypair = Ed25519Keypair.fromSecretKey(secretKey);
    }
    return this._ephemeralKeypair;
  }

  /**
   * Sign a transaction using zkLogin
   * @param txBytes - Serialized transaction bytes
   * @returns Signature result with zkLogin signature
   */
  async sign(txBytes: Uint8Array): Promise<SignatureResult> {
    if (!this.zkState.proof) {
      throw new Error('ZK proof not available');
    }

    const signature = await signWithZkLogin({
      txBytes,
      ephemeralPrivateKey: this.zkState.ephemeralPrivateKey,
      proof: this.zkState.proof,
      maxEpoch: this.zkState.maxEpoch,
      addressSeed: this.zkState.addressSeed,
    });

    return { signature };
  }

  /**
   * Sign a personal message with zkLogin.
   *
   * Uses the ephemeral keypair to produce a PersonalMessage-intent (scope=3)
   * signature, then wraps it with the zkLogin proof + maxEpoch. The result
   * verifies against `verifyPersonalMessageSignature` on the server when a
   * SuiClient is passed (needed for zkLogin epoch / JWK lookup).
   */
  async signPersonal(message: Uint8Array): Promise<SignatureResult> {
    if (!this.zkState.proof) {
      throw new Error('ZK proof not available');
    }
    const signature = await signPersonalWithZkLogin({
      message,
      ephemeralPrivateKey: this.zkState.ephemeralPrivateKey,
      proof: this.zkState.proof,
      maxEpoch: this.zkState.maxEpoch,
      addressSeed: this.zkState.addressSeed,
    });
    return { signature };
  }

  /**
   * Get the OAuth provider used for this session
   */
  getProvider(): string {
    return this.zkState.provider;
  }

  /**
   * Get user email if available
   */
  getEmail(): string | undefined {
    return this.zkState.email;
  }

  /**
   * Get user name if available
   */
  getName(): string | undefined {
    return this.zkState.name;
  }

  /**
   * Get user profile picture URL if available
   */
  getPicture(): string | undefined {
    return this.zkState.picture;
  }

  /**
   * Check if the session is still valid
   */
  isSessionValid(): boolean {
    return Date.now() < this.zkState.expiresAt;
  }

  /**
   * Expose session expiry so callers can apply their own grace period
   * (e.g. chat auth refuses to sign once <30s remain to avoid mid-handshake races).
   */
  getExpiresAt(): number {
    return this.zkState.expiresAt;
  }

  /**
   * Sign a message with the ephemeral Ed25519 key (not a zkLogin signature).
   * Useful for non-financial authentication (e.g., chat challenge-response)
   * where verifyPersonalMessageSignature against the zkLogin address is not applicable.
   */
  async signWithEphemeralKey(message: Uint8Array): Promise<SignatureResult> {
    const keypair = this.getEphemeralKeypair();
    const result = await keypair.signPersonalMessage(message);
    return { signature: result.signature };
  }

  /**
   * Get the base64-encoded ephemeral public key.
   * Used for server-side verification of ephemeral signatures.
   */
  getEphemeralPublicKey(): string {
    return this.getEphemeralKeypair().getPublicKey().toBase64();
  }
}
