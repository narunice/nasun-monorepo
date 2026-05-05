/**
 * useWhitelistRegistration Hook
 *
 * Manages the Frontiers NFT whitelist join/withdraw flow.
 * Uses wagmi + RainbowKit for multi-wallet support (MetaMask, Coinbase, WalletConnect, etc.).
 *
 * Flow: openConnectModal → wallet connects → checkStatus → signMessage → join/withdraw API
 * Auto-link: prepareChallenge → signMessage → connectVerify → link-account API
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { useStaticTranslation as useTranslation } from "@/providers/i18n/StaticTranslationProvider";
import { useAccount, useSignMessage, useDisconnect } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import {
  joinWhitelistWithSignature,
  withdrawWhitelistWithSignature,
  checkWhitelistStatus,
  WhitelistApiError,
} from "../../services/whitelistApi";
import { prepareChallenge, connectVerify } from "../../services/metamaskApi";
import { useAuth } from "@/features/auth";
import { useUserStore } from "../../store/userStore";
import type { WhitelistModalData } from "../../types/whitelist";

const shortenAddress = (address: string): string => {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

/** Detect user-rejected wallet actions from error messages */
function isUserRejection(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return (
    msg.includes("rejected") ||
    msg.includes("denied") ||
    msg.includes("cancelled") ||
    msg.includes("user refused")
  );
}

export function useWhitelistRegistration(onSuccess?: (walletAddress: string) => void) {
  const { t } = useTranslation(["myAccount", "common"]);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalData, setModalData] = useState<WhitelistModalData>({ state: "idle" });

  const { user } = useAuth();
  const { user: userProfile, updateUserProfile } = useUserStore();

  // wagmi hooks
  const { address, isConnected, connector } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { disconnectAsync } = useDisconnect();
  const { openConnectModal } = useConnectModal();

  // Ref for openConnectModal — undefined when already connected
  const openConnectModalRef = useRef(openConnectModal);
  useEffect(() => {
    openConnectModalRef.current = openConnectModal;
  }, [openConnectModal]);

  // Pending action refs — set before opening RainbowKit modal,
  // consumed in useEffect after wallet connects
  const pendingJoinRef = useRef(false);
  const pendingModalRef = useRef(false);

  const registeredEthAddress =
    user?.provider === "MetaMask" || user?.walletAddress
      ? user?.walletAddress
      : userProfile?.linkedAccounts?.metamask?.walletAddress;

  const openIntroModal = () => {
    setModalData({ state: "intro" });
    setModalOpen(true);
  };

  const handleModalOpenChange = (open: boolean) => {
    setModalOpen(open);
    if (!open) {
      pendingJoinRef.current = false;
      pendingModalRef.current = false;
      setTimeout(() => setModalData({ state: "idle" }), 200);
    }
  };

  // Auto-link wallet to the user's account (non-blocking, best-effort)
  const autoLinkWallet = useCallback(
    async (walletAddress: string) => {
      if (!user?.identityId) return;

      try {
        const { nonce, message } = await prepareChallenge();
        const signature = await signMessageAsync({ message });
        const authResult = await connectVerify(signature, nonce);

        const linkAccountApi = import.meta.env.VITE_LINK_ACCOUNT_API;
        if (!linkAccountApi) return;

        const linkHeaders: Record<string, string> = { "Content-Type": "application/json" };
        if (user.cognitoToken) {
          linkHeaders["Authorization"] = `Bearer ${user.cognitoToken}`;
        }

        const response = await fetch(linkAccountApi, {
          method: "POST",
          headers: linkHeaders,
          body: JSON.stringify({
            primaryIdentityId: user.identityId,
            secondaryIdentityId: authResult.identityId,
            secondaryProvider: connector?.name ?? "Wallet",
          }),
        });

        if (!response.ok) return;

        const userProfileApi = import.meta.env.VITE_USER_PROFILE_API;
        if (userProfileApi) {
          const profileResponse = await fetch(`${userProfileApi}?identityId=${user.identityId}`);
          if (profileResponse.ok) {
            const updatedProfile = await profileResponse.json();
            updateUserProfile(updatedProfile);
            localStorage.setItem("nasun_user_profile", JSON.stringify(updatedProfile));
          }
        }
      } catch (error) {
        console.warn("[useWhitelistRegistration] Auto-link failed (non-blocking):", error);
      }
    },
    [user, connector, signMessageAsync, updateUserProfile],
  );

  // Core join flow — called after wallet is connected
  const continueJoinFlow = useCallback(
    async (activeAddress: string) => {
      try {
        // Wallet mismatch check
        if (registeredEthAddress && activeAddress !== registeredEthAddress.toLowerCase()) {
          setModalData({
            state: "error",
            walletAddress: activeAddress,
            error:
              `The connected wallet does not match the wallet linked to your profile.\n\n` +
              `Profile wallet: ${shortenAddress(registeredEthAddress)}\n` +
              `Connected wallet: ${shortenAddress(activeAddress)}`,
            errorCode: "WALLET_MISMATCH",
          });
          return;
        }

        setModalData({ state: "connecting", walletAddress: activeAddress });

        const statusResponse = await checkWhitelistStatus(activeAddress);
        if (statusResponse.data.registered) {
          setModalData({
            state: "already_joined",
            walletAddress: activeAddress,
            joinedAt: statusResponse.data.joinedAt,
          });
          return;
        }

        setModalData({ state: "signing", walletAddress: activeAddress });

        const response = await joinWhitelistWithSignature(activeAddress, (message) =>
          signMessageAsync({ message }),
        );

        // Auto-link wallet if not already linked
        if (!registeredEthAddress && user?.identityId) {
          autoLinkWallet(activeAddress);
        }

        setModalData({
          state: "success",
          walletAddress: activeAddress,
          joinedAt: response.data.joinedAt,
        });

        onSuccess?.(activeAddress);
      } catch (error: unknown) {
        console.error("Join whitelist error:", error);

        if (error instanceof WhitelistApiError) {
          if (error.statusCode === 409) {
            setModalData({
              state: "already_joined",
              walletAddress: activeAddress,
              error: error.message,
            });
            return;
          }
          setModalData({
            state: "error",
            walletAddress: activeAddress,
            error: error.message,
            errorCode: error.errorCode,
          });
          return;
        }

        if (isUserRejection(error)) {
          setModalData({
            state: "error",
            walletAddress: activeAddress,
            error: "You rejected the signature request.",
            errorCode: "USER_REJECTED",
          });
          return;
        }

        setModalData({
          state: "error",
          walletAddress: activeAddress,
          error: error instanceof Error ? error.message : "An unexpected error occurred. Please try again.",
          errorCode: "UNKNOWN",
        });
      }
    },
    [registeredEthAddress, user, signMessageAsync, autoLinkWallet, onSuccess],
  );

  // After wallet connects via RainbowKit modal, continue the pending join flow
  useEffect(() => {
    if (isConnected && address && pendingJoinRef.current) {
      pendingJoinRef.current = false;
      continueJoinFlow(address.toLowerCase());
    }
  }, [isConnected, address, continueJoinFlow]);

  // Open the connect modal after disconnect completes
  useEffect(() => {
    if (pendingModalRef.current && !isConnected && openConnectModal) {
      pendingModalRef.current = false;
      openConnectModal();
    }
  }, [isConnected, openConnectModal]);

  const handleProceed = useCallback(async () => {
    if (isConnected && address) {
      // Already connected — proceed directly
      await continueJoinFlow(address.toLowerCase());
    } else {
      // Need to connect first
      setModalData({ state: "connecting" });
      pendingJoinRef.current = true;

      if (isConnected) {
        // Connected but no address (edge case) — disconnect first
        pendingModalRef.current = true;
        try {
          await disconnectAsync();
        } catch {
          pendingModalRef.current = false;
        }
      } else {
        openConnectModalRef.current?.();
      }
    }
  }, [isConnected, address, continueJoinFlow, disconnectAsync]);

  const handleWithdraw = useCallback(async () => {
    if (!modalData.walletAddress) return;
    const withdrawAddress = modalData.walletAddress;

    try {
      setModalData({ ...modalData, state: "signing" });

      await withdrawWhitelistWithSignature(withdrawAddress, (message) =>
        signMessageAsync({ message }),
      );

      setModalOpen(false);
      setModalData({ state: "idle" });

      alert(
        `${t("myAccount:whitelist.modal.withdrawSuccess.message")}\n\n${t("myAccount:whitelist.modal.withdrawSuccess.wallet")}: ${withdrawAddress}`,
      );
    } catch (error: unknown) {
      if (error instanceof WhitelistApiError && error.errorCode === "ALREADY_WITHDRAWN") {
        setModalData({
          state: "already_withdrawn",
          walletAddress: withdrawAddress,
        });
        return;
      }

      if (isUserRejection(error)) {
        setModalData({
          ...modalData,
          state: modalData.state === "success" ? "success" : "already_joined",
        });
        return;
      }

      setModalData({
        state: "error",
        walletAddress: withdrawAddress,
        error:
          error instanceof WhitelistApiError
            ? error.message
            : "Failed to withdraw from whitelist. Please try again.",
        errorCode: error instanceof WhitelistApiError ? error.errorCode : "UNKNOWN",
      });
    }
  }, [modalData, signMessageAsync, t]);

  return {
    modalOpen,
    modalData,
    openIntroModal,
    handleModalOpenChange,
    handleProceed,
    handleWithdraw,
  };
}
