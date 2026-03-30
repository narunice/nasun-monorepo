/**
 * useAppAdmin Hook
 * Checks if the current user is a platform admin who bypasses feature gates.
 * Distinct from useAdminAccess which checks on-chain AdminCap ownership.
 * TEMPORARY: Remove after 2026-04-07 when gates are removed.
 */

import { useWallet, useZkLogin, usePasskeyStore } from '@nasun/wallet';
import { ADMIN_EMAILS, ADMIN_ADDRESSES } from '../config/admin';

export function useAppAdmin(): boolean {
  const { isConnected: isZkLoggedIn, state: zkState } = useZkLogin();
  const { status, account } = useWallet();
  const passkeyAddress = usePasskeyStore((s) => s.address);
  const isPasskeyUnlocked = usePasskeyStore((s) => s.isUnlocked);

  // Check zkLogin email
  if (isZkLoggedIn && zkState?.email && ADMIN_EMAILS.includes(zkState.email)) {
    return true;
  }

  // Resolve active wallet address (same priority as useAdminAccess)
  const isLocalWalletActive = status === 'unlocked' && !!account?.address;
  const walletAddress = isZkLoggedIn
    ? zkState?.address
    : isLocalWalletActive
      ? account?.address
      : isPasskeyUnlocked
        ? passkeyAddress ?? undefined
        : undefined;

  if (walletAddress && ADMIN_ADDRESSES.includes(walletAddress)) {
    return true;
  }

  return false;
}
