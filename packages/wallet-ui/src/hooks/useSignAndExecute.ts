/**
 * useSignAndExecute
 *
 * Unified sign+execute hook for wallet-ui internal use. Covers all three
 * auth paths: zkLogin, passkey, and local self-custody wallet.
 */

import { useCallback } from 'react';
import { Transaction } from '@mysten/sui/transactions';
import { useWallet, useZkLogin, usePasskeyStore, getSuiClient } from '@nasun/wallet';

export type SignAndExecuteFn = (tx: Transaction) => Promise<{ digest: string }>;

export interface UseSignAndExecuteResult {
  address: string | null;
  isConnected: boolean;
  signAndExecute: SignAndExecuteFn;
}

export function useSignAndExecute(): UseSignAndExecuteResult {
  const { status, account, getKeypair } = useWallet();
  const { isConnected: isZkLoggedIn, state: zkState, signTransaction: zkSignTransaction } = useZkLogin();
  const passkeyKeypair = usePasskeyStore((s) => s.keypair);
  const passkeyAddress = usePasskeyStore((s) => s.address);
  const isPasskeyUnlocked = usePasskeyStore((s) => s.isUnlocked);

  const isLocalActive = status === 'unlocked' && !!account?.address;
  const address = isZkLoggedIn
    ? zkState?.address ?? null
    : isLocalActive
      ? account?.address ?? null
      : isPasskeyUnlocked
        ? passkeyAddress ?? null
        : null;
  const isConnected = isZkLoggedIn || isLocalActive || isPasskeyUnlocked;

  const signAndExecute = useCallback<SignAndExecuteFn>(
    async (tx) => {
      if (!address) {
        // The wallet may exist locally but be locked (passkey idle auto-lock,
        // session expiry, or a mobile browser tab kill that wiped the
        // in-memory keypair). Signal the app to open the unlock UI instead
        // of failing silently from the call site.
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('nasun:wallet-reconnect-required'));
        }
        throw new Error('Wallet is locked. Please unlock to continue.');
      }
      const client = getSuiClient();
      tx.setSender(address);
      const bytes = await tx.build({ client });

      let signature: string;
      if (isZkLoggedIn && zkState) {
        signature = await zkSignTransaction(bytes);
      } else if (isPasskeyUnlocked && passkeyKeypair) {
        const r = await passkeyKeypair.signTransaction(bytes);
        signature = r.signature;
      } else {
        const kp = getKeypair();
        if (!kp) throw new Error('Keypair not available');
        const r = await kp.signTransaction(bytes);
        signature = r.signature;
      }

      const result = await client.executeTransactionBlock({
        transactionBlock: bytes,
        signature,
        options: { showEffects: true },
      });
      if (result.effects?.status?.status !== 'success') {
        throw new Error(result.effects?.status?.error || 'Transaction failed');
      }
      return { digest: result.digest };
    },
    [address, getKeypair, isZkLoggedIn, zkState, zkSignTransaction, isPasskeyUnlocked, passkeyKeypair],
  );

  return { address, isConnected, signAndExecute };
}
