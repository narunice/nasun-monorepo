import { useEffect, useRef } from "react";
import { useWallet, useZkLogin } from "@nasun/wallet";
import type { UserData } from "@/store/userStore";
import type { UseWalletRegistrationResult } from "./useWalletRegistration";

export interface NasunWalletState {
  isNasunConnected: boolean;
  nasunWalletAddress: string | undefined;
  displayAddress: string | null;
  isPrimaryRegistered: boolean;
  additionalWallets: { walletAddress: string }[];
  showAsConnected: boolean | "" | null;
  hasLinkedWallet: boolean;
  /** Ref for auto-register dedup; exposed so callers can reset on manual Register */
  autoRegisterAttemptedRef: React.MutableRefObject<string | null>;
}

export function useNasunWalletState(
  user: UserData | null,
  walletReg: UseWalletRegistrationResult,
): NasunWalletState {
  const { status, account } = useWallet();
  const { isConnected: isZkConnected, state: zkState } = useZkLogin();

  const isNasunConnected = (status === "unlocked" && !!account) || isZkConnected;
  const nasunWalletAddress = account?.address ?? zkState?.address;

  // DB-stored linked wallet address (visible even when wallet is not actively connected)
  const nasunLinkedAddr = user?.linkedAccounts?.['nasun wallet']?.walletAddress;
  const legacyAddr = user?.walletAddress;
  // Sui/Nasun addresses are 66 chars (0x + 64 hex); EVM are 42 chars
  const linkedWalletAddress = nasunLinkedAddr
    || (legacyAddr && legacyAddr.startsWith('0x') && legacyAddr.length === 66 ? legacyAddr : undefined);

  const isLinkedWalletRegistered = !!linkedWalletAddress &&
    walletReg.registeredWallets.some(w => w.walletAddress === linkedWalletAddress.toLowerCase());
  const isExplicitlyUnregistered = !walletReg.isLoading
    && walletReg.registeredWallets.length > 0
    && !isLinkedWalletRegistered;
  const hasLinkedWallet = !!linkedWalletAddress && !isNasunConnected && !isExplicitlyUnregistered;

  // Connected wallet is "dismissed" if user explicitly Removed it this session
  const isConnectedButDismissed = isNasunConnected && nasunWalletAddress &&
    !walletReg.isCurrentWalletRegistered && !walletReg.isLoading &&
    sessionStorage.getItem('nasun:dismissed-wallet') === nasunWalletAddress.toLowerCase();
  const showAsConnected = isNasunConnected && nasunWalletAddress && !isConnectedButDismissed;

  // Primary registered wallet: shown when wallet is not actively connected
  const primaryRegisteredWallet = walletReg.registeredWallets[0] ?? null;
  const displayAddress = showAsConnected
    ? nasunWalletAddress!.toLowerCase()
    : hasLinkedWallet
      ? linkedWalletAddress!.toLowerCase()
      : primaryRegisteredWallet?.walletAddress ?? null;
  const isPrimaryRegistered = !!displayAddress &&
    walletReg.registeredWallets.some(w => w.walletAddress === displayAddress);
  const additionalWallets = displayAddress
    ? walletReg.registeredWallets.filter(w => w.walletAddress !== displayAddress)
    : walletReg.registeredWallets;

  // Auto-register: when a new wallet is connected and not yet registered
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nasunWalletAddress, isNasunConnected, user?.cognitoToken,
      walletReg.isCurrentWalletRegistered, walletReg.isRegistering,
      walletReg.isLoading, walletReg.hasSigner, walletReg.signerAddress]);

  return {
    isNasunConnected,
    nasunWalletAddress,
    displayAddress,
    isPrimaryRegistered,
    additionalWallets,
    showAsConnected,
    hasLinkedWallet,
    autoRegisterAttemptedRef,
  };
}
