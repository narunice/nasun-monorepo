/**
 * Address Book Server Sync
 * Handles server communication for address book synchronization.
 * Infrastructure-agnostic: API endpoint and auth token are injected via configure().
 */

import type { AddressBook } from '../types';

export interface AddressBookSyncConfig {
  /** API endpoint base URL (e.g., 'https://xxx.execute-api.../prod') */
  apiEndpoint: string;
  /** Function to get the current auth token. Returns null if not authenticated. */
  getToken: () => Promise<string | null> | string | null;
}

export interface ServerAddressBookResponse {
  addressBook: AddressBook;
  version: number;
}

let _syncConfig: AddressBookSyncConfig | null = null;

/**
 * Configure address book sync. Call once at app initialization.
 * If not called, sync is disabled (local-only mode).
 */
export function configureAddressBookSync(config: AddressBookSyncConfig): void {
  _syncConfig = config;
}

/**
 * Get the current sync config. Returns null if not configured.
 */
export function getAddressBookSyncConfig(): AddressBookSyncConfig | null {
  return _syncConfig;
}

/**
 * Reset sync config (for logout/cleanup).
 */
export function resetAddressBookSyncConfig(): void {
  _syncConfig = null;
}

/**
 * Check if sync is configured and ready.
 */
export function isAddressBookSyncEnabled(): boolean {
  return _syncConfig !== null;
}

/**
 * Fetch address book from server.
 * Returns null if sync is not configured or auth fails.
 */
export async function fetchAddressBookFromServer(
  signal?: AbortSignal,
): Promise<ServerAddressBookResponse | null> {
  if (!_syncConfig) return null;

  const token = await _syncConfig.getToken();
  if (!token) return null;

  const url = `${_syncConfig.apiEndpoint}/address-book`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      signal,
    });

    if (!response.ok) {
      console.warn(`[AddressBookSync] GET failed: ${response.status}`);
      return null;
    }

    const data = await response.json();
    return {
      addressBook: data.addressBook,
      version: data.version ?? 0,
    };
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return null; // Cancelled, not an error
    }
    console.warn('[AddressBookSync] GET error:', error);
    return null;
  }
}

/**
 * Push address book to server.
 * Returns the new version on success, 'conflict' on 409, or null on failure.
 */
export async function pushAddressBookToServer(
  data: AddressBook,
  version: number,
  options?: { keepalive?: boolean },
): Promise<'success' | 'conflict' | null> {
  if (!_syncConfig) return null;

  const token = await _syncConfig.getToken();
  if (!token) return null;

  const url = `${_syncConfig.apiEndpoint}/address-book`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ addressBook: data, version }),
      keepalive: options?.keepalive ?? false,
    });

    if (response.status === 409) {
      return 'conflict';
    }

    if (!response.ok) {
      console.warn(`[AddressBookSync] POST failed: ${response.status}`);
      return null;
    }

    return 'success';
  } catch (error: unknown) {
    console.warn('[AddressBookSync] POST error:', error);
    return null;
  }
}
