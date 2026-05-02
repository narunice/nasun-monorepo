import { useCallback } from 'react';
import { Transaction } from '@mysten/sui/transactions';
import { useWallet, useZkLogin, usePasskeyStore } from '@nasun/wallet';
import { getSuiClient } from '../lib/sui-client';

export interface SignAndExecuteOptions {
  showObjectChanges?: boolean;
  showEffects?: boolean;
  showEvents?: boolean;
}

export interface SignAndExecuteResult {
  digest: string;
  effects?: unknown;
  objectChanges?: unknown;
}

export interface UseSignAndExecuteResult {
  walletAddress: string | undefined;
  isWalletConnected: boolean;
  signAndExecute: (tx: Transaction, opts?: SignAndExecuteOptions) => Promise<SignAndExecuteResult>;
}

export function useSignAndExecute(): UseSignAndExecuteResult {
  const { status, account, getKeypair } = useWallet();
  const { isConnected: isZkLoggedIn, state: zkState, signTransaction: zkSignTransaction } = useZkLogin();
  const passkeyKeypair = usePasskeyStore((s) => s.keypair);
  const passkeyAddress = usePasskeyStore((s) => s.address);
  const isPasskeyUnlocked = usePasskeyStore((s) => s.isUnlocked);

  const isLocalWalletActive = status === 'unlocked' && !!account?.address;
  const walletAddress = isZkLoggedIn
    ? zkState?.address
    : isLocalWalletActive
      ? account?.address
      : isPasskeyUnlocked
        ? passkeyAddress ?? undefined
        : undefined;
  const isWalletConnected = isZkLoggedIn || isLocalWalletActive || isPasskeyUnlocked;

  const signAndExecute = useCallback(
    async (tx: Transaction, opts: SignAndExecuteOptions = {}): Promise<SignAndExecuteResult> => {
      if (!walletAddress) throw new Error('Wallet not connected');

      const client = getSuiClient();
      tx.setSender(walletAddress);
      const bytes = await tx.build({ client });

      let signature: string;
      if (isZkLoggedIn && zkState) {
        signature = await zkSignTransaction(bytes);
      } else if (isPasskeyUnlocked && passkeyKeypair) {
        const signResult = await passkeyKeypair.signTransaction(bytes);
        signature = signResult.signature;
      } else {
        const keypair = getKeypair();
        if (!keypair) throw new Error('Keypair not available');
        const signResult = await keypair.signTransaction(bytes);
        signature = signResult.signature;
      }

      const result = await client.executeTransactionBlock({
        transactionBlock: bytes,
        signature,
        options: {
          showEffects: opts.showEffects ?? true,
          showEvents: opts.showEvents ?? true,
          showObjectChanges: opts.showObjectChanges ?? false,
        },
      });

      if (result.effects?.status?.status !== 'success') {
        throw new Error(result.effects?.status?.error || 'Transaction failed');
      }
      return {
        digest: result.digest,
        effects: result.effects,
        objectChanges: result.objectChanges,
      };
    },
    [walletAddress, getKeypair, isZkLoggedIn, zkState, zkSignTransaction, isPasskeyUnlocked, passkeyKeypair],
  );

  return { walletAddress, isWalletConnected, signAndExecute };
}
