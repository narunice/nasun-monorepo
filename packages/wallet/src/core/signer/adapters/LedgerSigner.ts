/**
 * LedgerSigner - Hardware Wallet Signer Adapter
 *
 * Provides SignerAdapter interface for Ledger hardware wallets.
 * Supports both Sui/Move (Ed25519) and EVM (secp256k1) chains.
 *
 * @example
 * ```typescript
 * // Must be called from user gesture (button click)
 * const transport = await createTransport();
 * const signer = await LedgerSigner.create(transport, {
 *   chainType: 'move',
 *   accountIndex: 0,
 * });
 *
 * // Sign a transaction
 * const { signature } = await signer.sign(txBytes);
 * ```
 */

import type { SignerAdapter, SignerCapabilities, SignatureResult } from '../types';
import {
  type LedgerTransport,
  type LedgerSignerOptions,
  type LedgerChainType,
  type SuiLedgerClientInterface,
  type EvmLedgerClientInterface,
  LedgerError,
} from '../../ledger/types';
import { closeTransport, parseLedgerError } from '../../ledger/transport';
import {
  createSuiLedgerClient,
  getSuiAddress,
  signSuiTransaction,
  signSuiPersonalMessage,
} from '../../ledger/sui-ledger';
import {
  createEvmLedgerClient,
  getEvmAddress,
  signEvmPersonalMessage,
} from '../../ledger/evm-ledger';

/** Ledger signer capabilities */
const LEDGER_CAPABILITIES: SignerCapabilities = {
  sessionKeys: false, // Hardware cannot manage session keys
  batchSign: false, // Each TX requires device approval
  gasSponsorship: false, // No AA support
  requiresHardwareConfirm: true, // ** KEY: Requires device confirmation **
};

/**
 * LedgerSigner - Hardware Wallet SignerAdapter
 *
 * Wraps Ledger device communication and provides unified signing interface.
 * Uses factory pattern due to async initialization requirements.
 */
export class LedgerSigner implements SignerAdapter {
  readonly type = 'ledger' as const;
  readonly address: string;
  readonly capabilities: SignerCapabilities = LEDGER_CAPABILITIES;

  /** Chain type (move or evm) */
  readonly chainType: LedgerChainType;

  /** BIP44 derivation path used */
  readonly derivationPath: string;

  /** Public key in base64 (Sui) or hex (EVM) */
  readonly publicKey: string;

  private transport: LedgerTransport;
  private suiClient: SuiLedgerClientInterface | null = null;
  private evmClient: EvmLedgerClientInterface | null = null;
  private connected = true;

  /**
   * Private constructor - use LedgerSigner.create() instead
   */
  private constructor(
    transport: LedgerTransport,
    address: string,
    publicKey: string,
    derivationPath: string,
    chainType: LedgerChainType,
    suiClient: SuiLedgerClientInterface | null,
    evmClient: EvmLedgerClientInterface | null
  ) {
    this.transport = transport;
    this.address = address;
    this.publicKey = publicKey;
    this.derivationPath = derivationPath;
    this.chainType = chainType;
    this.suiClient = suiClient;
    this.evmClient = evmClient;

    // Listen for disconnect events
    this.setupDisconnectHandler();
  }

  /**
   * Create a LedgerSigner instance
   *
   * Factory method for async initialization. Must be called within a user
   * gesture (button click) if the transport is being created.
   *
   * @param transport - Ledger transport instance
   * @param options - Signer options (chainType, accountIndex, etc.)
   * @returns LedgerSigner instance
   * @throws LedgerError if initialization fails
   */
  static async create(
    transport: LedgerTransport,
    options: LedgerSignerOptions
  ): Promise<LedgerSigner> {
    const { chainType, accountIndex = 0 } = options;

    if (chainType === 'move') {
      return LedgerSigner.createSuiSigner(transport, accountIndex);
    } else if (chainType === 'evm') {
      return LedgerSigner.createEvmSigner(transport, accountIndex);
    }

    throw new LedgerError(
      `Unsupported chain type: ${chainType}`,
      'UNSUPPORTED_OPERATION'
    );
  }

  /**
   * Create a Sui/Move LedgerSigner
   */
  private static async createSuiSigner(
    transport: LedgerTransport,
    accountIndex: number
  ): Promise<LedgerSigner> {
    try {
      const client = await createSuiLedgerClient(transport);
      const { address, publicKey, derivationPath } = await getSuiAddress(client, accountIndex);

      return new LedgerSigner(
        transport,
        address,
        publicKey,
        derivationPath,
        'move',
        client,
        null
      );
    } catch (error) {
      if (error instanceof LedgerError) throw error;
      throw parseLedgerError(error);
    }
  }

  /**
   * Create an EVM LedgerSigner
   */
  private static async createEvmSigner(
    transport: LedgerTransport,
    accountIndex: number
  ): Promise<LedgerSigner> {
    try {
      const client = await createEvmLedgerClient(transport);
      const { address, publicKey, derivationPath } = await getEvmAddress(client, accountIndex);

      return new LedgerSigner(
        transport,
        address,
        publicKey,
        derivationPath,
        'evm',
        null,
        client
      );
    } catch (error) {
      if (error instanceof LedgerError) throw error;
      throw parseLedgerError(error);
    }
  }

  /**
   * Sign transaction bytes
   *
   * @param txBytes - Serialized transaction bytes to sign
   * @returns Signature result
   * @throws LedgerError if signing fails or user rejects
   */
  async sign(txBytes: Uint8Array): Promise<SignatureResult> {
    this.ensureConnected();

    if (this.chainType === 'move' && this.suiClient) {
      return this.signSui(txBytes);
    } else if (this.chainType === 'evm' && this.evmClient) {
      return this.signEvm(txBytes);
    }

    throw new LedgerError('Signer not properly initialized', 'UNKNOWN');
  }

  /**
   * Sign a personal message
   *
   * @param message - Message bytes to sign
   * @returns Signature result
   * @throws LedgerError if signing fails or not supported
   */
  async signPersonal(message: Uint8Array): Promise<SignatureResult> {
    this.ensureConnected();

    if (this.chainType === 'move' && this.suiClient) {
      return this.signSuiPersonal(message);
    } else if (this.chainType === 'evm' && this.evmClient) {
      return this.signEvmPersonal(message);
    }

    throw new LedgerError('Signer not properly initialized', 'UNKNOWN');
  }

  /**
   * Sign Sui transaction
   */
  private async signSui(txBytes: Uint8Array): Promise<SignatureResult> {
    try {
      const signature = await signSuiTransaction(
        this.suiClient!,
        txBytes,
        this.derivationPath
      );
      return { signature };
    } catch (error) {
      if (error instanceof LedgerError) throw error;
      throw parseLedgerError(error);
    }
  }

  /**
   * Sign Sui personal message
   */
  private async signSuiPersonal(message: Uint8Array): Promise<SignatureResult> {
    try {
      const signature = await signSuiPersonalMessage(
        this.suiClient!,
        message,
        this.derivationPath
      );
      return { signature };
    } catch (error) {
      if (error instanceof LedgerError) throw error;
      throw parseLedgerError(error);
    }
  }

  /**
   * Sign EVM transaction/message bytes
   *
   * Note: For EVM, raw txBytes are typically used for message signing.
   * For transaction signing, use signEvmTransaction in evm-ledger.ts directly.
   */
  private async signEvm(txBytes: Uint8Array): Promise<SignatureResult> {
    // For EVM, sign as personal message
    // Real transaction signing should use signEvmTransaction with RLP-encoded tx
    return this.signEvmPersonal(txBytes);
  }

  /**
   * Sign EVM personal message (EIP-191)
   */
  private async signEvmPersonal(message: Uint8Array): Promise<SignatureResult> {
    try {
      const signature = await signEvmPersonalMessage(
        this.evmClient!,
        message,
        this.derivationPath
      );
      return { signature };
    } catch (error) {
      if (error instanceof LedgerError) throw error;
      throw parseLedgerError(error);
    }
  }

  /**
   * Check if the Ledger is still connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Disconnect from the Ledger device
   */
  async disconnect(): Promise<void> {
    this.connected = false;
    await closeTransport(this.transport);
  }

  /**
   * Get the derivation path used
   */
  getDerivationPath(): string {
    return this.derivationPath;
  }

  /**
   * Get the public key
   */
  getPublicKey(): string {
    return this.publicKey;
  }

  /**
   * Get the underlying transport
   */
  getTransport(): LedgerTransport {
    return this.transport;
  }

  /**
   * Get the Sui client (if available)
   */
  getSuiClient(): SuiLedgerClientInterface | null {
    return this.suiClient;
  }

  /**
   * Get the EVM client (if available)
   */
  getEvmClient(): EvmLedgerClientInterface | null {
    return this.evmClient;
  }

  /**
   * Ensure the Ledger is still connected
   */
  private ensureConnected(): void {
    if (!this.connected) {
      throw new LedgerError(
        'Ledger disconnected. Please reconnect and try again.',
        'DEVICE_DISCONNECTED'
      );
    }
  }

  /**
   * Setup disconnect event handler
   */
  private setupDisconnectHandler(): void {
    try {
      this.transport.on('disconnect', () => {
        this.connected = false;
        console.warn('[LedgerSigner] Device disconnected');
      });
    } catch {
      // Transport may not support events
    }
  }

  /**
   * Create a new signer for a different account index
   *
   * @param accountIndex - New account index
   * @returns New LedgerSigner for the specified account
   */
  async switchAccount(accountIndex: number): Promise<LedgerSigner> {
    this.ensureConnected();

    return LedgerSigner.create(this.transport, {
      chainType: this.chainType,
      accountIndex,
    });
  }
}

/**
 * Helper type for LedgerSigner options with account selection
 */
export interface LedgerAccountOptions {
  /** Account index (0-based) */
  accountIndex?: number;
  /** Custom derivation path (overrides accountIndex) */
  derivationPath?: string;
}
