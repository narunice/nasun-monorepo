import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  connectWallet,
  signMessage,
  isMetaMaskInstalled,
  getMetaMaskErrorType,
  switchNetwork,
} from "../../utils/metamaskUtils";
import {
  joinWhitelistWithSignature,
  withdrawWhitelistWithSignature,
  checkWhitelistStatus,
  WhitelistApiError,
} from "../../services/whitelistApi";
import { authenticateWithMetaMask } from "../../services/metamaskApi";
import { connectMetaMaskSDK, signMessageViaSDK } from "../../lib/wallet/metamaskSdkProvider";
import { isMobileBrowser } from "../../utils/mobileDetect";
import { useAuth } from "@/features/auth";
import { useUserStore } from "../../store/userStore";
import type { WhitelistModalData } from "../../types/whitelist";

// Helper to shorten address for display
const shortenAddress = (address: string): string => {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

export function useWhitelistRegistration(onSuccess?: (walletAddress: string) => void) {
  const { t } = useTranslation(["myAccount", "common"]);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalData, setModalData] = useState<WhitelistModalData>({
    state: "idle",
  });

  const { user } = useAuth();
  const { user: userProfile, updateUserProfile } = useUserStore();

  const registeredEthAddress =
    user?.provider === "MetaMask"
      ? user.walletAddress
      : userProfile?.linkedAccounts?.metamask?.walletAddress;

  const openIntroModal = () => {
    setModalData({ state: "intro" });
    setModalOpen(true);
  };

  const handleModalOpenChange = (open: boolean) => {
    setModalOpen(open);
    if (!open) {
      setTimeout(() => {
        setModalData({ state: "idle" });
      }, 200);
    }
  };

  const autoLinkWallet = async (walletAddress: string) => {
    if (!user?.identityId) return;

    const mobile = isMobileBrowser();

    try {
      // switchNetwork uses window.ethereum — skip on mobile (SDK handles connection)
      if (!mobile) {
        const expectedChainId = import.meta.env.VITE_ETHEREUM_CHAIN_ID;
        if (expectedChainId) {
          await switchNetwork(expectedChainId);
        }
      }

      const authResult = await authenticateWithMetaMask(walletAddress, async (message) => {
        return mobile
          ? await signMessageViaSDK(message, walletAddress)
          : await signMessage(message, walletAddress);
      });

      const linkAccountApi = import.meta.env.VITE_LINK_ACCOUNT_API;
      if (!linkAccountApi) return;

      const linkHeaders: Record<string, string> = { "Content-Type": "application/json" };
      if (user.cognitoToken) {
        linkHeaders["Authorization"] = `Bearer ${user.cognitoToken}`;
      }

      const response = await fetch(`${linkAccountApi}/link`, {
        method: "POST",
        headers: linkHeaders,
        body: JSON.stringify({
          primaryIdentityId: user.identityId,
          secondaryIdentityId: authResult.identityId,
          secondaryProvider: "MetaMask",
          walletAddress: walletAddress.toLowerCase(),
        }),
      });

      if (!response.ok) return;

      const userProfileApi = import.meta.env.VITE_USER_PROFILE_API;
      if (userProfileApi) {
        const profileResponse = await fetch(`${userProfileApi}?identityId=${user.identityId}`);
        if (profileResponse.ok) {
          const updatedProfile = await profileResponse.json();
          updateUserProfile(updatedProfile);
          sessionStorage.setItem("nasun_user_profile", JSON.stringify(updatedProfile));
        }
      }
    } catch (error) {
      console.warn("[useWhitelistRegistration] Auto-link failed (non-blocking):", error);
    }
  };

  const handleProceed = async () => {
    const mobile = isMobileBrowser();

    // On mobile, MetaMask SDK handles connection via deep link — no window.ethereum needed
    if (!mobile && !isMetaMaskInstalled()) {
      setModalData({
        state: "error",
        error: t("common:wallet.metamask_not_installed"),
        errorCode: "NO_METAMASK",
      });
      return;
    }

    try {
      setModalData({ state: "connecting" });

      const walletAddress = mobile ? await connectMetaMaskSDK() : await connectWallet();
      let activeAddress = walletAddress.toLowerCase();

      // Wallet mismatch check.
      // personal_sign only works with the currently selected MetaMask account,
      // so the active account must match the registered wallet.
      if (registeredEthAddress && activeAddress !== registeredEthAddress.toLowerCase()) {
        const isMetaMaskPrimary = user?.provider === "MetaMask";
        setModalData({
          state: "error",
          walletAddress: activeAddress,
          error: isMetaMaskPrimary
            ? `Your MetaMask is set to a different account.\n\n` +
              `Please switch to your login wallet in MetaMask:\n` +
              `${registeredEthAddress}\n\n` +
              `Open MetaMask → click the account icon → select the correct account, then try again.`
            : `The connected wallet does not match the wallet linked to your profile.\n\n` +
              `Profile wallet: ${shortenAddress(registeredEthAddress)}\n` +
              `Connected wallet: ${shortenAddress(walletAddress)}`,
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
        mobile ? signMessageViaSDK(message, activeAddress) : signMessage(message, activeAddress),
      );

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
      const metamaskErrorType = getMetaMaskErrorType(error);

      if (error instanceof WhitelistApiError) {
        if (error.statusCode === 409) {
          setModalData({
            state: "already_joined",
            walletAddress: modalData.walletAddress,
            error: error.message,
          });
          return;
        }

        setModalData({
          state: "error",
          walletAddress: modalData.walletAddress,
          error: error.message,
          errorCode: error.errorCode,
        });
        return;
      }

      if (metamaskErrorType === "USER_REJECTED") {
        setModalData({
          state: "error",
          walletAddress: modalData.walletAddress,
          error: "You rejected the signature request.",
          errorCode: "USER_REJECTED",
        });
        return;
      }

      setModalData({
        state: "error",
        walletAddress: modalData.walletAddress,
        error:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred. Please try again.",
        errorCode: "UNKNOWN",
      });
    }
  };

  const handleWithdraw = async () => {
    if (!modalData.walletAddress) return;

    const mobile = isMobileBrowser();

    try {
      setModalData({ ...modalData, state: "signing" });

      await withdrawWhitelistWithSignature(modalData.walletAddress, (message) => {
        return mobile
          ? signMessageViaSDK(message, modalData.walletAddress!)
          : signMessage(message, modalData.walletAddress!);
      });

      setModalOpen(false);
      setModalData({ state: "idle" });

      alert(
        `${t("myAccount:whitelist.modal.withdrawSuccess.message")}\n\n${t("myAccount:whitelist.modal.withdrawSuccess.wallet")}: ${modalData.walletAddress}`,
      );
    } catch (error: unknown) {
      if (error instanceof WhitelistApiError && error.errorCode === "ALREADY_WITHDRAWN") {
        setModalData({
          state: "already_withdrawn",
          walletAddress: modalData.walletAddress,
        });
        return;
      }

      const metamaskErrorType = getMetaMaskErrorType(error);
      if (metamaskErrorType === "USER_REJECTED") {
        setModalData({
          ...modalData,
          state: modalData.state === "success" ? "success" : "already_joined",
        });
        return;
      }

      setModalData({
        state: "error",
        walletAddress: modalData.walletAddress,
        error:
          error instanceof WhitelistApiError
            ? error.message
            : "Failed to withdraw from whitelist. Please try again.",
        errorCode: error instanceof WhitelistApiError ? error.errorCode : "UNKNOWN",
      });
    }
  };

  return {
    modalOpen,
    modalData,
    openIntroModal,
    handleModalOpenChange,
    handleProceed,
    handleWithdraw,
  };
}
