/**
 * NsaSigner - Nasun Smart Account Signer Adapter
 *
 * Wraps an underlying signer (zkLogin, Local, etc.) and associates it
 * with a SmartAccount object. The actual signing is delegated to the
 * underlying signer, while the NsaSigner provides SmartAccount context
 * for transaction building.
 */

import type { SignerAdapter, SignerCapabilities, SignatureResult } from '../types';

export class NsaSigner implements SignerAdapter {
  readonly type = 'nsa' as const;
  readonly address: string;
  readonly capabilities: SignerCapabilities;

  private underlyingSigner: SignerAdapter;
  private _accountObjectId: string;

  /**
   * Create an NsaSigner wrapping an underlying signer
   *
   * @param underlyingSigner - The actual signer (zkLogin, Local, etc.)
   * @param accountObjectId - The SmartAccount object ID on chain
   */
  constructor(underlyingSigner: SignerAdapter, accountObjectId: string) {
    this.underlyingSigner = underlyingSigner;
    this._accountObjectId = accountObjectId;
    // Address is the underlying signer's address (registered in SmartAccount)
    this.address = underlyingSigner.address;
    this.capabilities = {
      sessionKeys: false,
      batchSign: false,
      gasSponsorship: true,
      requiresHardwareConfirm: underlyingSigner.capabilities.requiresHardwareConfirm,
    };
  }

  /**
   * Sign a transaction - delegates to underlying signer
   */
  async sign(txBytes: Uint8Array): Promise<SignatureResult> {
    return this.underlyingSigner.sign(txBytes);
  }

  /**
   * Sign a personal message - delegates to underlying signer
   */
  async signPersonal(message: Uint8Array): Promise<SignatureResult> {
    return this.underlyingSigner.signPersonal(message);
  }

  /**
   * Get the SmartAccount object ID
   */
  get accountObjectId(): string {
    return this._accountObjectId;
  }

  /**
   * Get the underlying signer type
   */
  get underlyingType(): string {
    return this.underlyingSigner.type;
  }

  /**
   * Get the underlying signer instance
   */
  getUnderlyingSigner(): SignerAdapter {
    return this.underlyingSigner;
  }

  /**
   * Update the underlying signer (e.g., after key rotation)
   */
  updateUnderlyingSigner(newSigner: SignerAdapter): void {
    this.underlyingSigner = newSigner;
    // Note: address is readonly in interface, but we need to update it
    // The address field is set at construction time and represents
    // the signer address registered in the SmartAccount
    (this as { address: string }).address = newSigner.address;
  }
}
