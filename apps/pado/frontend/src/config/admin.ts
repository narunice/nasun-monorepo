/**
 * Platform Admin Accounts
 * Admin accounts bypass games-only mode gate and spot access code.
 * TEMPORARY: Remove after 2026-04-07 when gates are removed.
 */

// zkLogin emails that are treated as platform admins
export const ADMIN_EMAILS: readonly string[] = [
  'admin@nasun.io',
  'naru@nasun.io',
];

// Wallet addresses that are treated as platform admins
export const ADMIN_ADDRESSES: readonly string[] = [
  '0xe1c4c90bd18d22d5d8fbc9ab7994bdcf1ac717714c0f5375528c229d6dfb3d90',
];
