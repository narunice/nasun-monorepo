import { useEffect, useRef } from "react";
import { useWallet, useZkLogin } from "@nasun/wallet";
import type { UserData } from "@/store/userStore";
import type { UseUjuWalletRegistrationResult } from "./useUjuWalletRegistration";

export interface UjuNasunWalletState {
  isNasunConnected: boolean;
  nasunWalletAddress: string | undefined;
  displayAddress: string | null;
  isPrimaryRegistered: boolean;
  isProfileWallet: boolean;
  additionalWallets: { walletAddress: string }[];
  showAsConnected: boolean | "" | null;
  hasLinkedWallet: boolean;
  autoRegisterAttemptedRef: React.MutableRefObject<string | null>;
}

export function useUjuNasunWalletState(
  user: UserData | null,
  walletReg: UseUjuWalletRegistrationResult,
): UjuNasunWalletState {
  const { status, account } = useWallet();
  const { isConnected: isZkConnected, state: zkState } = useZkLogin();

  const isNasunConnected = (status === "unlocked" && !!account) || isZkConnected;
  const nasunWalletAddress = account?.address ?? zkState?.address;

  const nasunLinkedAddr = user?.linkedAccounts?.['nasun wallet']?.walletAddress;
  const legacyAddr = user?.walletAddress;
  const linkedWalletAddress = nasunLinkedAddr
    || (legacyAddr && legacyAddr.startsWith('0x') && legacyAddr.length === 66 ? legacyAddr : undefined);

  const isLinkedWalletRegistered = !!linkedWalletAddress &&
    walletReg.registeredWallets.some(w => w.walletAddress === linkedWalletAddress.toLowerCase());
  const isExplicitlyUnregistered = !walletReg.isLoading
    && walletReg.registeredWallets.length > 0
    && !isLinkedWalletRegistered;
  const hasLinkedWallet = !!linkedWalletAddress && !isNasunConnected && !isExplicitlyUnregistered;

  const isConnectedButDismissed = isNasunConnected && nasunWalletAddress &&
    !walletReg.isCurrentWalletRegistered && !walletReg.isLoading &&
    sessionStorage.getItem('nasun:dismissed-wallet') === nasunWalletAddress.toLowerCase();
  const showAsConnected = isNasunConnected && nasunWalletAddress && !isConnectedButDismissed;

  const primaryRegisteredWallet = (() => {
    if (!walletReg.registeredWallets.length) return null;
    if (linkedWalletAddress) {
      const match = walletReg.registeredWallets.find(
        w => w.walletAddress === linkedWalletAddress.toLowerCase(),
      );
      if (match) return match;
    }
    return walletReg.registeredWallets[0];
  })();
  const displayAddress = showAsConnected
    ? nasunWalletAddress!.toLowerCase()
    : hasLinkedWallet
      ? linkedWalletAddress!.toLowerCase()
      : primaryRegisteredWallet?.walletAddress ?? null;
  const isPrimaryRegistered = !!displayAddress &&
    walletReg.registeredWallets.some(w => w.walletAddress === displayAddress);
  const isProfileWallet = !!displayAddress && !!linkedWalletAddress &&
    displayAddress === linkedWalletAddress.toLowerCase();
  const additionalWallets = displayAddress
    ? walletReg.registeredWallets.filter(w => w.walletAddress !== displayAddress)
    : walletReg.registeredWallets;

  const autoRegisterAttemptedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isNasunConnected || !nasunWalletAddress || !user?.cognitoToken) return;
    if (walletReg.isCurrentWalletRegistered || walletReg.isRegistering) return;
    if (autoRegisterAttemptedRef.current === nasunWalletAddress) return;
    if (walletReg.isLoading) return;
    if (!walletReg.hasSigner) return;
    if (walletReg.signerAddress?.toLowerCase() !== nasunWalletAddress.toLowerCase()) return;
    const dismissed = sessionStorage.getItem('nasun:dismissed-wallet');
    if (dismissed === nasunWalletAddress.toLowerCase()) return;
    autoRegisterAttemptedRef.current = nasunWalletAddress;
    walletReg.registerCurrentWallet().catch(() => {});
  }, [nasunWalletAddress, isNasunConnected, user?.cognitoToken,
      walletReg.isCurrentWalletRegistered, walletReg.isRegistering,
      walletReg.isLoading, walletReg.hasSigner, walletReg.signerAddress, walletReg]);

  return {
    isNasunConnected,
    nasunWalletAddress,
    displayAddress,
    isPrimaryRegistered,
    isProfileWallet,
    additionalWallets,
    showAsConnected,
    hasLinkedWallet,
    autoRegisterAttemptedRef,
  };
}
