/**
 * useAdminAccess Hook
 * Checks if the connected wallet has any AdminCap (Prediction or Lottery)
 */

import { useState, useEffect } from 'react';
import { useWallet, useZkLogin, usePasskeyStore } from '@nasun/wallet';
import { getSuiClient } from '../../../lib/sui-client';
import { LOTTERY_PACKAGE_ID } from '../../lottery/constants';
import { PREDICTION_PACKAGE_ID } from '../../prediction/constants';
import { SCRATCHCARD_PACKAGE_ID } from '../../scratchcard/constants';

const LOTTERY_ADMIN_CAP_TYPE = `${LOTTERY_PACKAGE_ID}::lottery::AdminCap`;
const PREDICTION_ADMIN_CAP_TYPE = `${PREDICTION_PACKAGE_ID}::prediction_market::AdminCap`;
const SCRATCHCARD_ADMIN_CAP_TYPE = `${SCRATCHCARD_PACKAGE_ID}::scratchcard::AdminCap`;

export interface AdminCapInfo {
  lotteryAdminCapId: string | null;
  predictionAdminCapId: string | null;
  scratchcardAdminCapId: string | null;
}

export interface UseAdminAccessResult {
  isAdmin: boolean;
  isLotteryAdmin: boolean;
  isPredictionAdmin: boolean;
  isScratchcardAdmin: boolean;
  adminCaps: AdminCapInfo;
  isLoading: boolean;
}

export function useAdminAccess(): UseAdminAccessResult {
  const { status, account } = useWallet();
  const { isConnected: isZkLoggedIn, state: zkState } = useZkLogin();
  const passkeyAddress = usePasskeyStore((s) => s.address);
  const isPasskeyUnlocked = usePasskeyStore((s) => s.isUnlocked);

  const [isLoading, setIsLoading] = useState(true);
  const [adminCaps, setAdminCaps] = useState<AdminCapInfo>({
    lotteryAdminCapId: null,
    predictionAdminCapId: null,
  });

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
        setAdminCaps({
          lotteryAdminCapId: null,
          predictionAdminCapId: null,
          scratchcardAdminCapId: null,
        });
        setIsLoading(false);
        return;
      }

      setIsLoading(true);

      try {
        const client = getSuiClient();

        // Check Lottery AdminCap
        const lotteryCapObjects = await client.getOwnedObjects({
          owner: walletAddress,
          filter: { StructType: LOTTERY_ADMIN_CAP_TYPE },
        });

        // Check Prediction AdminCap
        const predictionCapObjects = await client.getOwnedObjects({
          owner: walletAddress,
          filter: { StructType: PREDICTION_ADMIN_CAP_TYPE },
        });

        // Check Scratchcard AdminCap
        const scratchcardCapObjects = await client.getOwnedObjects({
          owner: walletAddress,
          filter: { StructType: SCRATCHCARD_ADMIN_CAP_TYPE },
        });

        setAdminCaps({
          lotteryAdminCapId:
            lotteryCapObjects.data.length > 0
              ? lotteryCapObjects.data[0].data?.objectId || null
              : null,
          predictionAdminCapId:
            predictionCapObjects.data.length > 0
              ? predictionCapObjects.data[0].data?.objectId || null
              : null,
          scratchcardAdminCapId:
            scratchcardCapObjects.data.length > 0
              ? scratchcardCapObjects.data[0].data?.objectId || null
              : null,
        });
      } catch (err) {
        console.error('Error checking AdminCaps:', err);
        setAdminCaps({
          lotteryAdminCapId: null,
          predictionAdminCapId: null,
          scratchcardAdminCapId: null,
        });
      } finally {
        setIsLoading(false);
      }
    }

    checkAdminCaps();
  }, [walletAddress]);

  const isLotteryAdmin = !!adminCaps.lotteryAdminCapId;
  const isPredictionAdmin = !!adminCaps.predictionAdminCapId;
  const isScratchcardAdmin = !!adminCaps.scratchcardAdminCapId;
  const isAdmin = isLotteryAdmin || isPredictionAdmin || isScratchcardAdmin;

  return {
    isAdmin,
    isLotteryAdmin,
    isPredictionAdmin,
    isScratchcardAdmin,
    adminCaps,
    isLoading,
  };
}
