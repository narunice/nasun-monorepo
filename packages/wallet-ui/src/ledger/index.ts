/**
 * Ledger UI Components
 *
 * Hardware wallet integration UI for enhanced security.
 * Rebranded as "Hardware Key" for user-friendly messaging.
 *
 * Key Components:
 * - LedgerConnect: Connection button/dropdown
 * - LedgerSigningPrompt: Device confirmation modal
 * - LedgerErrorDisplay: Natural language error messages
 * - LedgerAddressSelector: Derived address picker
 */

export {
  LedgerConnect,
  LedgerBrowserWarning,
  isWebHIDSupported,
} from './LedgerConnect';
export type { LedgerConnectProps } from './LedgerConnect';

export {
  LedgerSigningPrompt,
  LedgerSigningIndicator,
} from './LedgerSigningPrompt';
export type { LedgerSigningPromptProps } from './LedgerSigningPrompt';

export { LedgerErrorDisplay, getLedgerErrorMessage } from './LedgerErrorDisplay';
export type { LedgerErrorDisplayProps } from './LedgerErrorDisplay';

export {
  LedgerAddressSelector,
  LedgerAddressDropdown,
} from './LedgerAddressSelector';
export type {
  LedgerAddressSelectorProps,
  LedgerAddress,
} from './LedgerAddressSelector';
