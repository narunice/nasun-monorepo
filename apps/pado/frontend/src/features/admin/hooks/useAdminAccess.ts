/**
 * useAdminAccess Hook
 * Checks if the connected wallet has the Prediction AdminCap.
 * (Lottery / Scratchcard / NumberMatch admin checks were retired with the games archive.)
 */

import { useState, useEffect } from 'react';
import { useWallet, useZkLogin, usePasskeyStore } from '@nasun/wallet';
import { getSuiClient } from '../../../lib/sui-client';
import { PREDICTION_PACKAGE_ID } from '../../prediction/constants';

const PREDICTION_ADMIN_CAP_TYPE = `${PREDICTION_PACKAGE_ID}::prediction_market::AdminCap`;

export interface AdminCapInfo {
  predictionAdminCapId: string | null;
}

export interface UseAdminAccessResult {
  isAdmin: boolean;
  isPredictionAdmin: boolean;
  adminCaps: AdminCapInfo;
  isLoading: boolean;
}

const EMPTY_CAPS: AdminCapInfo = {
  predictionAdminCapId: null,
};

export function useAdminAccess(): UseAdminAccessResult {
  const { status, account } = useWallet();
  const { isConnected: isZkLoggedIn, state: zkState } = useZkLogin();
  const passkeyAddress = usePasskeyStore((s) => s.address);
  const isPasskeyUnlocked = usePasskeyStore((s) => s.isUnlocked);

  const [isLoading, setIsLoading] = useState(true);
  const [adminCaps, setAdminCaps] = useState<AdminCapInfo>({ ...EMPTY_CAPS });

  // Determine active wallet (zkLogin takes priority)
  const isLocalWalletActive = status === 'unlocked' && !!account?.address;
  const walletAddress = isZkLoggedIn
    ? zkState?.address
    : isLocalWalletActive
      ? account?.address
      : isPasskeyUnlocked
        ? passkeyAddress ?? undefined
        : undefined;

  useEffect(() => {
    async function checkAdminCaps() {
      if (!walletAddress) {
        setAdminCaps({ ...EMPTY_CAPS });
        setIsLoading(false);
        return;
      }

      setIsLoading(true);

      try {
        const client = getSuiClient();
        const predictionCaps = await client.getOwnedObjects({
          owner: walletAddress,
          filter: { StructType: PREDICTION_ADMIN_CAP_TYPE },
        });

        setAdminCaps({
          predictionAdminCapId:
            predictionCaps.data.length > 0
              ? predictionCaps.data[0].data?.objectId || null
              : null,
        });
      } catch (err) {
        console.error('Error checking AdminCaps:', err);
        setAdminCaps({ ...EMPTY_CAPS });
      } finally {
        setIsLoading(false);
      }
    }

    checkAdminCaps();
  }, [walletAddress]);

  const isPredictionAdmin = !!adminCaps.predictionAdminCapId;
  const isAdmin = isPredictionAdmin;

  return {
    isAdmin,
    isPredictionAdmin,
    adminCaps,
    isLoading,
  };
}
