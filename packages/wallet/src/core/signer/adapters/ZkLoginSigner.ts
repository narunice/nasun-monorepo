/**
 * ZkLoginSigner - zkLogin based signer
 *
 * Wraps zkLogin state for the SignerAdapter interface.
 * Uses OAuth + ZK proof for transaction signing.
 */

import type { SignerAdapter, SignerCapabilities, SignatureResult } from '../types';
import type { ZkLoginState } from '../../../types/zklogin';
import { signWithZkLogin } from '../../zklogin';
import { DEFAULT_CAPABILITIES } from '../types';

export class ZkLoginSigner implements SignerAdapter {
  readonly type = 'zklogin' as const;
  readonly address: string;
  readonly capabilities: SignerCapabilities = {
    ...DEFAULT_CAPABILITIES,
  };

  private zkState: ZkLoginState;

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
   * Sign a personal message
   * @throws zkLogin does not support personal message signing
   */
  async signPersonal(_message: Uint8Array): Promise<SignatureResult> {
    throw new Error('zkLogin does not support personal message signing');
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
}
