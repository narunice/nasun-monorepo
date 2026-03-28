import { useState, useCallback, useEffect } from 'react';
import { Transaction } from '@mysten/sui/transactions';
import { useWallet, useZkLogin, usePasskeyStore } from '@nasun/wallet';
import { useQueryClient } from '@tanstack/react-query';
import { getSuiClient } from '../../../lib/sui-client';
import {
  buildFundPool,
  buildWithdrawPool,
  buildEmergencyWithdrawAll,
  buildSetPaused,
} from '../transactions';
import { ADMIN_CAP_TYPE } from '../constants';

export interface AdminResult {
  success: boolean;
  digest?: string;
  error?: string;
}

export interface UseNumberMatchAdminResult {
  isAdmin: boolean;
  isLoading: boolean;
  adminCapId: string | null;
  fundPool: (nusdcCoinId: string) => Promise<AdminResult>;
  withdrawPool: (amount: bigint) => Promise<AdminResult>;
  emergencyWithdrawAll: () => Promise<AdminResult>;
  setPaused: (paused: boolean) => Promise<AdminResult>;
}

export function useNumberMatchAdmin(): UseNumberMatchAdminResult {
  const { status, account, getKeypair } = useWallet();
  const {
    isConnected: isZkLoggedIn,
    state: zkState,
    signTransaction: zkSignTransaction,
  } = useZkLogin();
  const passkeyKeypair = usePasskeyStore((s) => s.keypair);
  const passkeyAddress = usePasskeyStore((s) => s.address);
  const isPasskeyUnlocked = usePasskeyStore((s) => s.isUnlocked);
  const queryClient = useQueryClient();

  const isLocalWalletActive = status === 'unlocked' && !!account?.address;
  const walletAddress = isZkLoggedIn
    ? zkState?.address
    : isLocalWalletActive
      ? account?.address
      : isPasskeyUnlocked
        ? (passkeyAddress ?? undefined)
        : undefined;

  const [isLoading, setIsLoading] = useState(true);
  const [adminCapId, setAdminCapId] = useState<string | null>(null);

  // Detect AdminCap ownership
  useEffect(() => {
    async function checkAdmin() {
      if (!walletAddress) {
        setAdminCapId(null);
        setIsLoading(false);
        return;
      }

      try {
        const client = getSuiClient();
        const response = await client.getOwnedObjects({
          owner: walletAddress,
          filter: { StructType: ADMIN_CAP_TYPE },
          options: { showContent: true },
          limit: 1,
        });

        if (response.data.length > 0 && response.data[0].data) {
          setAdminCapId(response.data[0].data.objectId);
        } else {
          setAdminCapId(null);
        }
      } catch {
        setAdminCapId(null);
      } finally {
        setIsLoading(false);
      }
    }

    checkAdmin();
  }, [walletAddress]);

  const signAndExecute = useCallback(
    async (tx: Transaction): Promise<AdminResult> => {
      if (!walletAddress) return { success: false, error: 'Wallet not connected' };

      try {
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
          if (!keypair) return { success: false, error: 'Keypair not available' };
          const signResult = await keypair.signTransaction(bytes);
          signature = signResult.signature;
        }

        const result = await client.executeTransactionBlock({
          transactionBlock: bytes,
          signature,
          options: { showEffects: true },
        });

        if (result.effects?.status?.status !== 'success') {
          return {
            success: false,
            error: result.effects?.status?.error || 'Transaction failed',
          };
        }

        queryClient.invalidateQueries({ queryKey: ['numbermatch-pool'] });
        return { success: true, digest: result.digest };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        };
      }
    },
    [walletAddress, getKeypair, isZkLoggedIn, zkState, zkSignTransaction, isPasskeyUnlocked, passkeyKeypair, queryClient],
  );

  const fundPool = useCallback(
    (nusdcCoinId: string) => signAndExecute(buildFundPool(nusdcCoinId)),
    [signAndExecute],
  );

  const withdrawPool = useCallback(
    (amount: bigint) => signAndExecute(buildWithdrawPool(amount)),
    [signAndExecute],
  );

  const emergencyWithdrawAll = useCallback(
    () => signAndExecute(buildEmergencyWithdrawAll()),
    [signAndExecute],
  );

  const setPaused = useCallback(
    (paused: boolean) => signAndExecute(buildSetPaused(paused)),
    [signAndExecute],
  );

  return {
    isAdmin: !!adminCapId,
    isLoading,
    adminCapId,
    fundPool,
    withdrawPool,
    emergencyWithdrawAll,
    setPaused,
  };
}
