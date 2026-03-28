/**
 * useAdminAccess Hook
 * Checks if the connected wallet has any AdminCap (Prediction, Lottery, Scratchcard, NumberMatch)
 */

import { useState, useEffect } from 'react';
import { useWallet, useZkLogin, usePasskeyStore } from '@nasun/wallet';
import { getSuiClient } from '../../../lib/sui-client';
import { LOTTERY_PACKAGE_ID } from '../../lottery/constants';
import { PREDICTION_PACKAGE_ID } from '../../prediction/constants';
import { SCRATCHCARD_PACKAGE_ID } from '../../scratchcard/constants';
import { NUMBERMATCH_PACKAGE_ID } from '../../numbermatch/constants';

const LOTTERY_ADMIN_CAP_TYPE = `${LOTTERY_PACKAGE_ID}::lottery::AdminCap`;
const PREDICTION_ADMIN_CAP_TYPE = `${PREDICTION_PACKAGE_ID}::prediction_market::AdminCap`;
const SCRATCHCARD_ADMIN_CAP_TYPE = `${SCRATCHCARD_PACKAGE_ID}::scratchcard::AdminCap`;
const NUMBERMATCH_ADMIN_CAP_TYPE = `${NUMBERMATCH_PACKAGE_ID}::numbermatch::AdminCap`;

export interface AdminCapInfo {
  lotteryAdminCapId: string | null;
  predictionAdminCapId: string | null;
  scratchcardAdminCapId: string | null;
  numbermatchAdminCapId: string | null;
}

export interface UseAdminAccessResult {
  isAdmin: boolean;
  isLotteryAdmin: boolean;
  isPredictionAdmin: boolean;
  isScratchcardAdmin: boolean;
  isNumberMatchAdmin: boolean;
  adminCaps: AdminCapInfo;
  isLoading: boolean;
}

const EMPTY_CAPS: AdminCapInfo = {
  lotteryAdminCapId: null,
  predictionAdminCapId: null,
  scratchcardAdminCapId: null,
  numbermatchAdminCapId: null,
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

        // Check all AdminCaps in parallel
        const [lotteryCaps, predictionCaps, scratchcardCaps, numbermatchCaps] = await Promise.all([
          client.getOwnedObjects({ owner: walletAddress, filter: { StructType: LOTTERY_ADMIN_CAP_TYPE } }),
          client.getOwnedObjects({ owner: walletAddress, filter: { StructType: PREDICTION_ADMIN_CAP_TYPE } }),
          client.getOwnedObjects({ owner: walletAddress, filter: { StructType: SCRATCHCARD_ADMIN_CAP_TYPE } }),
          client.getOwnedObjects({ owner: walletAddress, filter: { StructType: NUMBERMATCH_ADMIN_CAP_TYPE } }),
        ]);

        setAdminCaps({
          lotteryAdminCapId:
            lotteryCaps.data.length > 0
              ? lotteryCaps.data[0].data?.objectId || null
              : null,
          predictionAdminCapId:
            predictionCaps.data.length > 0
              ? predictionCaps.data[0].data?.objectId || null
              : null,
          scratchcardAdminCapId:
            scratchcardCaps.data.length > 0
              ? scratchcardCaps.data[0].data?.objectId || null
              : null,
          numbermatchAdminCapId:
            numbermatchCaps.data.length > 0
              ? numbermatchCaps.data[0].data?.objectId || null
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

  const isLotteryAdmin = !!adminCaps.lotteryAdminCapId;
  const isPredictionAdmin = !!adminCaps.predictionAdminCapId;
  const isScratchcardAdmin = !!adminCaps.scratchcardAdminCapId;
  const isNumberMatchAdmin = !!adminCaps.numbermatchAdminCapId;
  const isAdmin = isLotteryAdmin || isPredictionAdmin || isScratchcardAdmin || isNumberMatchAdmin;

  return {
    isAdmin,
    isLotteryAdmin,
    isPredictionAdmin,
    isScratchcardAdmin,
    isNumberMatchAdmin,
    adminCaps,
    isLoading,
  };
}
