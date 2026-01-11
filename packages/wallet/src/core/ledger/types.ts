/**
 * Ledger Integration Types
 *
 * Type definitions for Ledger hardware wallet integration.
 * Supports both Sui/Move (Ed25519) and EVM (secp256k1) chains.
 */

/** Ledger connection status */
export type LedgerConnectionStatus =
  | 'disconnected' // No connection
  | 'connecting' // Transport being created
  | 'connected' // Transport ready and app detected
  | 'app-required' // Need to open app on device
  | 'error'; // Connection error

/** Ledger error codes for user-friendly messages */
export type LedgerErrorCode =
  | 'USER_REJECTED' // User rejected on device
  | 'DEVICE_LOCKED' // Device is locked
  | 'APP_NOT_OPEN' // Required app not open
  | 'DEVICE_DISCONNECTED' // Device disconnected
  | 'TRANSPORT_ERROR' // Transport communication error
  | 'INVALID_PATH' // Invalid derivation path
  | 'UNSUPPORTED_OPERATION' // Operation not supported
  | 'BROWSER_NOT_SUPPORTED' // Browser doesn't support WebHID
  | 'UNKNOWN'; // Unknown error

/**
 * Custom Ledger error class
 *
 * Provides typed error codes for better error handling.
 */
export class LedgerError extends Error {
  constructor(
    message: string,
    public readonly code: LedgerErrorCode,
    public readonly originalError?: unknown
  ) {
    super(message);
    this.name = 'LedgerError';
  }
}

/** Ledger device model info */
export interface LedgerDeviceInfo {
  /** Device model (e.g., 'nanoS', 'nanoX', 'stax') */
  model?: string;
  /** Firmware version */
  firmwareVersion?: string;
  /** App name currently open */
  appName?: string;
  /** App version */
  appVersion?: string;
}

/**
 * Derivation paths for supported chains
 *
 * BIP-44 format: m/purpose'/coin_type'/account'/change/index
 */
export const LEDGER_DERIVATION_PATHS = {
  /**
   * Sui/Nasun: m/44'/784'/0'/0'/account'
   * Coin type 784 = SUI (based on phone keypad letters)
   */
  SUI: (account = 0) => `m/44'/784'/0'/0'/${account}'`,

  /**
   * EVM: 44'/60'/0'/0/account
   * Coin type 60 = Ethereum
   * Note: No 'm/' prefix for Ledger Ethereum app
   */
  EVM: (account = 0) => `44'/60'/0'/0/${account}`,
} as const;

/** Chain type for Ledger signer */
export type LedgerChainType = 'move' | 'evm';

/** Options for LedgerSigner creation */
export interface LedgerSignerOptions {
  /** Chain type ('move' for Sui/Nasun or 'evm' for Ethereum) */
  chainType: LedgerChainType;
  /** Custom derivation path (optional, uses default for chain) */
  derivationPath?: string;
  /** Account index (0-based, default: 0) */
  accountIndex?: number;
  /** EVM chain ID (required for EVM chains) */
  evmChainId?: number;
}

/** Result from Ledger address derivation */
export interface LedgerAddressResult {
  /** Derived address */
  address: string;
  /** Public key (base64 for Sui, hex for EVM) */
  publicKey: string;
  /** Derivation path used */
  derivationPath: string;
}

/** Ledger transport type */
export type LedgerTransport = {
  close(): Promise<void>;
  send(
    cla: number,
    ins: number,
    p1: number,
    p2: number,
    data?: Buffer,
    statusList?: number[]
  ): Promise<Buffer>;
  on(event: 'disconnect', callback: () => void): void;
  off(event: 'disconnect', callback: () => void): void;
};

/** Sui Ledger client interface */
export interface SuiLedgerClientInterface {
  getPublicKey(path: string): Promise<{ publicKey: Uint8Array }>;
  signTransaction(path: string, txBytes: Uint8Array): Promise<{ signature: Uint8Array }>;
  signPersonalMessage?(path: string, message: Uint8Array): Promise<{ signature: Uint8Array }>;
}

/** EVM Ledger client interface */
export interface EvmLedgerClientInterface {
  getAddress(
    path: string,
    boolDisplay?: boolean,
    boolChaincode?: boolean
  ): Promise<{ address: string; publicKey: string; chainCode?: string }>;
  signTransaction(
    path: string,
    rawTxHex: string,
    resolution?: unknown
  ): Promise<{ v: string; r: string; s: string }>;
  signPersonalMessage(
    path: string,
    messageHex: string
  ): Promise<{ v: number; r: string; s: string }>;
}
