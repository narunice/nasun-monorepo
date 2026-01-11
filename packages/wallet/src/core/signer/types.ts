/**
 * Signer Abstraction Layer Types
 *
 * Provides a unified interface for different signing methods:
 * - Local (Ed25519 keypair) - Nasun/Sui
 * - EVM (secp256k1) - Ethereum, Base, Arbitrum
 * - zkLogin (OAuth + ZK proof) - Nasun/Sui
 * - Ledger (hardware wallet) - P2
 * - Smart Account (ERC-4337 AA) - P1 (after multi-chain)
 * - MPC (multi-party computation) - P3
 */

/** Supported signer types */
export type SignerType = 'local' | 'evm' | 'ledger' | 'mpc' | 'zklogin' | 'smart-account';

/** Result of a signing operation */
export interface SignatureResult {
  /** Base64-encoded signature string */
  signature: string;
  /** Raw signature bytes (optional) */
  bytes?: Uint8Array;
}

/** Capabilities that a signer may support */
export interface SignerCapabilities {
  /** Supports session keys for auto-approval (AA) */
  sessionKeys: boolean;
  /** Supports signing multiple transactions in batch */
  batchSign: boolean;
  /** Supports gas sponsorship / paymaster (AA) */
  gasSponsorship: boolean;
  /** Requires hardware confirmation before signing (Ledger) */
  requiresHardwareConfirm: boolean;
}

/** Default capabilities for basic signers */
export const DEFAULT_CAPABILITIES: SignerCapabilities = {
  sessionKeys: false,
  batchSign: false,
  gasSponsorship: false,
  requiresHardwareConfirm: false,
};

/**
 * Abstract interface for all signer implementations
 *
 * @example
 * ```typescript
 * const signer: SignerAdapter = new LocalSigner(keypair);
 * const txBytes = await tx.build({ client });
 * const { signature } = await signer.sign(txBytes);
 * ```
 */
export interface SignerAdapter {
  /** Type identifier for this signer */
  readonly type: SignerType;

  /** Wallet address associated with this signer */
  readonly address: string;

  /** Capabilities supported by this signer */
  readonly capabilities: SignerCapabilities;

  /**
   * Sign a transaction
   * @param txBytes - Serialized transaction bytes
   * @returns Signature result
   */
  sign(txBytes: Uint8Array): Promise<SignatureResult>;

  /**
   * Sign a personal message
   * @param message - Message bytes to sign
   * @returns Signature result
   * @throws If the signer does not support personal message signing
   */
  signPersonal(message: Uint8Array): Promise<SignatureResult>;
}

/** Events emitted by SignerManager */
export type SignerEvent =
  | { type: 'registered'; signer: SignerAdapter }
  | { type: 'unregistered'; signerType: SignerType }
  | { type: 'switched'; signer: SignerAdapter }
  | { type: 'cleared' };

/** Listener for signer events */
export type SignerEventListener = (event: SignerEvent) => void;
