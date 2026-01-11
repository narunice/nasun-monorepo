/**
 * Ledger Module
 *
 * Hardware wallet integration for Ledger devices.
 * Supports both Sui/Move and EVM chains.
 */

// Types
export {
  type LedgerConnectionStatus,
  type LedgerErrorCode,
  type LedgerDeviceInfo,
  type LedgerChainType,
  type LedgerSignerOptions,
  type LedgerAddressResult,
  type LedgerTransport,
  type SuiLedgerClientInterface,
  type EvmLedgerClientInterface,
  LedgerError,
  LEDGER_DERIVATION_PATHS,
} from './types';

// Transport utilities
export {
  isWebHIDSupported,
  createTransport,
  closeTransport,
  parseLedgerError,
  getLedgerErrorMessage,
} from './transport';

// Sui Ledger client
export {
  createSuiLedgerClient,
  deriveSuiAddress,
  getSuiAddress,
  signSuiTransaction,
  signSuiPersonalMessage,
} from './sui-ledger';

// EVM Ledger client
export {
  createEvmLedgerClient,
  getEvmAddress,
  signEvmTransaction,
  signEvmPersonalMessage,
  formatEvmSignature,
  parseVValue,
} from './evm-ledger';
