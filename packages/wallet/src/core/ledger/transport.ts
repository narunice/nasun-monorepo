/**
 * Ledger Transport Utilities
 *
 * Manages WebHID transport for Ledger device communication.
 * IMPORTANT: Transport creation must be called within a user gesture (button click).
 */

import { LedgerError, type LedgerTransport } from './types';

/**
 * Check if WebHID is supported in the current browser
 *
 * @returns true if WebHID is available
 */
export function isWebHIDSupported(): boolean {
  if (typeof navigator === 'undefined') return false;
  return 'hid' in navigator;
}

/**
 * Create a WebHID transport for Ledger communication
 *
 * IMPORTANT: This function MUST be called within a user gesture (button click)
 * due to WebHID security requirements. HTTPS is also required.
 *
 * @returns Ledger transport instance
 * @throws LedgerError if connection fails
 *
 * @example
 * ```typescript
 * // Must be called from button click handler
 * const handleConnect = async () => {
 *   try {
 *     const transport = await createTransport();
 *     // Use transport...
 *   } catch (err) {
 *     if (err instanceof LedgerError) {
 *       console.error(err.code, err.message);
 *     }
 *   }
 * };
 *
 * <button onClick={handleConnect}>Connect Ledger</button>
 * ```
 */
export async function createTransport(): Promise<LedgerTransport> {
  if (!isWebHIDSupported()) {
    throw new LedgerError(
      'WebHID is not supported in this browser. Please use Chrome or Edge.',
      'BROWSER_NOT_SUPPORTED'
    );
  }

  try {
    // Dynamic import to avoid SSR issues and reduce bundle size
    const TransportWebHID = (await import('@ledgerhq/hw-transport-webhid')).default;

    // Create transport - this will trigger the browser's device picker
    const transport = await TransportWebHID.create();

    return transport as unknown as LedgerTransport;
  } catch (error) {
    throw parseLedgerError(error);
  }
}

/**
 * Close a Ledger transport connection
 *
 * @param transport - The transport to close
 */
export async function closeTransport(transport: LedgerTransport): Promise<void> {
  try {
    await transport.close();
  } catch (error) {
    // Ignore close errors - device may already be disconnected
    console.warn('[Ledger] Error closing transport:', error);
  }
}

/**
 * Parse Ledger errors into user-friendly LedgerError instances
 *
 * Maps common Ledger status codes and error messages to typed error codes.
 *
 * @param error - The error to parse
 * @returns A LedgerError with appropriate code and message
 */
export function parseLedgerError(error: unknown): LedgerError {
  const message = error instanceof Error ? error.message : String(error);

  // User rejected on device
  if (
    message.includes('0x6985') ||
    message.includes('denied') ||
    message.includes('rejected') ||
    message.includes('Rejected')
  ) {
    return new LedgerError('Transaction rejected on device', 'USER_REJECTED', error);
  }

  // Device is locked
  if (message.includes('0x6986') || message.includes('locked') || message.includes('Locked')) {
    return new LedgerError(
      'Device is locked. Please unlock your Ledger.',
      'DEVICE_LOCKED',
      error
    );
  }

  // Wrong app or no app open
  if (
    message.includes('0x6E00') ||
    message.includes('CLA_NOT_SUPPORTED') ||
    message.includes('0x6D00') ||
    message.includes('INS_NOT_SUPPORTED')
  ) {
    return new LedgerError(
      'Please open the correct app on your Ledger',
      'APP_NOT_OPEN',
      error
    );
  }

  // Device not found or disconnected
  if (
    message.includes('No device selected') ||
    message.includes('not found') ||
    message.includes('NotFoundError')
  ) {
    return new LedgerError(
      'No Ledger device found. Please connect your device and try again.',
      'DEVICE_DISCONNECTED',
      error
    );
  }

  // Access denied
  if (message.includes('Access denied') || message.includes('SecurityError')) {
    return new LedgerError(
      'Access to Ledger denied. Please grant permission and try again.',
      'TRANSPORT_ERROR',
      error
    );
  }

  // Transport errors
  if (
    message.includes('transport') ||
    message.includes('Transport') ||
    message.includes('disconnected') ||
    message.includes('Disconnected')
  ) {
    return new LedgerError(
      'Ledger disconnected. Please reconnect and try again.',
      'DEVICE_DISCONNECTED',
      error
    );
  }

  // Invalid data length
  if (message.includes('0x6700') || message.includes('Wrong length')) {
    return new LedgerError('Invalid data sent to device', 'TRANSPORT_ERROR', error);
  }

  // Invalid derivation path
  if (message.includes('path') || message.includes('derivation')) {
    return new LedgerError('Invalid derivation path', 'INVALID_PATH', error);
  }

  // WebHID not supported
  if (message.includes('hid') || message.includes('HID')) {
    return new LedgerError(
      'WebHID is not supported in this browser. Please use Chrome or Edge.',
      'BROWSER_NOT_SUPPORTED',
      error
    );
  }

  // Unknown error
  return new LedgerError(message || 'Unknown Ledger error', 'UNKNOWN', error);
}

/**
 * Get user-friendly error message for display
 *
 * @param code - The LedgerErrorCode
 * @returns Localized error message
 */
export function getLedgerErrorMessage(code: string): string {
  const messages: Record<string, string> = {
    USER_REJECTED: 'Transaction rejected on device',
    DEVICE_LOCKED: 'Device is locked. Please unlock your Ledger.',
    APP_NOT_OPEN: 'Please open the correct app on your Ledger',
    DEVICE_DISCONNECTED: 'Ledger disconnected. Please reconnect.',
    TRANSPORT_ERROR: 'Communication error with Ledger device',
    INVALID_PATH: 'Invalid derivation path',
    UNSUPPORTED_OPERATION: 'Operation not supported on this device',
    BROWSER_NOT_SUPPORTED: 'WebHID is not supported. Please use Chrome or Edge.',
    UNKNOWN: 'An unknown error occurred',
  };

  return messages[code] || messages.UNKNOWN;
}
