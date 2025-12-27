/**
 * Wallet Connect Card Component
 *
 * @description
 * MetaMask 지갑 연결을 위한 카드 컴포넌트
 *
 * @author Claude Code
 * @date 2025-10-25
 */

import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../../../../providers/auth/AuthContext";
import { useUserStore } from "../../../../../store/userStore";
import {
  isMetaMaskInstalled as checkMetaMaskInstalled,
  connectWallet,
  signMessage,
  isCorrectNetwork,
  switchNetwork,
} from "../../../../../utils/metamaskUtils";
import { authenticateWithMetaMask } from "../../../../../services/metamaskApi";
import { Button } from "../../../../ui/button";
import logger from "../../../../../lib/logger";
import { InlineLoading, DividerBox } from "../../../../ui";
import { BattalionNftCard } from "../BattalionNftCard";

interface WalletConnectCardProps {
  onWalletConnected: (address: string) => void;
}

/**
 * Wallet Connect Card 컴포넌트
 *
 * @features
 * - MetaMask 설치 확인
 * - 지갑 연결 버튼
 * - 연결된 지갑 주소 표시 (축약 형식)
 * - MetaMask 설치 링크
 * - 연결 상태 표시
 */
export const WalletConnectCard: React.FC<WalletConnectCardProps> = ({ onWalletConnected }) => {
  const { t } = useTranslation("battalion-nft");
  const { user } = useAuth();
  const { updateUserProfile } = useUserStore();
  const [isMetaMaskInstalled, setIsMetaMaskInstalled] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectedAddress, setConnectedAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const expectedChainId = import.meta.env.VITE_ETHEREUM_CHAIN_ID || "1";
  const networkName = import.meta.env.VITE_ETHEREUM_NETWORK_NAME || "Ethereum";

  useEffect(() => {
    setIsMetaMaskInstalled(checkMetaMaskInstalled());

    // ✅ linkedWallet 확인 (이미 연결된 경우)
    const linkedWallet = user?.linkedAccounts?.metamask?.walletAddress;

    if (linkedWallet && window.ethereum) {
      // 이미 link된 경우 - eth_accounts로 확인
      window.ethereum
        .request({ method: "eth_accounts" })
        .then((accounts: string[]) => {
          if (accounts.length > 0) {
            const address = accounts[0];

            if (linkedWallet.toLowerCase() === address.toLowerCase()) {
              // 연결된 지갑과 일치 - 정상
              console.log("[WalletConnectCard] Wallet already linked:", address);
              setConnectedAddress(address);
            } else {
              // 다른 지갑으로 변경됨
              console.warn("[WalletConnectCard] Wallet address mismatch - clearing");
              setConnectedAddress(null);
            }
          } else {
            // MetaMask에 계정이 없음
            console.warn("[WalletConnectCard] No accounts in MetaMask");
            setConnectedAddress(null);
          }
        })
        .catch((err: Error) => {
          console.error("Failed to check accounts:", err);
          setConnectedAddress(null);
        });
    } else {
      // linkedWallet이 없으면 connect button 표시
      console.log("[WalletConnectCard] No linked wallet - showing connect button");
      setConnectedAddress(null);
    }
  }, [user]);

  const handleConnect = async () => {
    try {
      setIsConnecting(true);
      setError(null);

      // 1. Check if already linked
      const linkedWallet = user?.linkedAccounts?.metamask?.walletAddress;

      // 2. Connect wallet
      const walletAddress = await connectWallet();
      logger.log("[WalletConnectCard] Connected wallet:", walletAddress);

      // 3. Check network
      const correctNetwork = await isCorrectNetwork(expectedChainId);
      if (!correctNetwork) {
        logger.log("[WalletConnectCard] Switching to correct network...");
        await switchNetwork(expectedChainId);
      }

      // 4. If not linked, authenticate and link account
      if (!linkedWallet) {
        logger.log("[WalletConnectCard] Wallet not linked - authenticating...");

        // 4a. Authenticate with MetaMask (Challenge/Response)
        const authResult = await authenticateWithMetaMask(walletAddress, async (message) => {
          return await signMessage(message, walletAddress);
        });

        logger.log("[WalletConnectCard] MetaMask auth successful:", authResult);

        // 4b. Link accounts
        const linkAccountApi = import.meta.env.VITE_LINK_ACCOUNT_API;
        if (!linkAccountApi) {
          throw new Error("Link Account API is not configured");
        }

        const linkResponse = await fetch(linkAccountApi, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            primaryIdentityId: user?.identityId,
            secondaryIdentityId: authResult.identityId,
            secondaryProvider: "MetaMask",
          }),
        });

        if (!linkResponse.ok) {
          throw new Error("Failed to link MetaMask account");
        }

        logger.log("[WalletConnectCard] Account linked successfully");

        // 4c. Fetch updated profile
        const userProfileApi = import.meta.env.VITE_USER_PROFILE_API;
        const profileResponse = await fetch(`${userProfileApi}?identityId=${user?.identityId}`);

        if (profileResponse.ok) {
          const updatedProfile = await profileResponse.json();
          updateUserProfile(updatedProfile);
          localStorage.setItem("nasun_user_profile", JSON.stringify(updatedProfile));
          logger.log("[WalletConnectCard] User profile updated");
        } else {
          throw new Error("Failed to fetch updated profile");
        }
      } else {
        logger.log("[WalletConnectCard] Wallet already linked - skipping link step");
      }

      // 5. Set connected address and proceed to next step
      setConnectedAddress(walletAddress);
      onWalletConnected(walletAddress);
    } catch (err: unknown) {
      console.error("[WalletConnectCard] Connection error:", err);
      const errorMessage = err instanceof Error ? err.message : t("step4.errors.connectionFailed");
      setError(errorMessage);
    } finally {
      setIsConnecting(false);
    }
  };

  const shortenAddress = (address: string): string => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  if (!isMetaMaskInstalled) {
    return (
      <BattalionNftCard>
        <div className="text-center">
          {/* MetaMask Logo */}
          <div className="mb-6 flex justify-center">
            <div className="w-20 h-20 bg-orange-900/20 rounded-full flex items-center justify-center">
              <img src="/MetaMask_Fox.svg" alt="MetaMask" className="w-12 h-12" />
            </div>
          </div>

          <h3 className="!font-rubik font-medium mb-3">{t("step4.title")}</h3>

          <p className="mb-6">{t("step4.errors.noMetaMask")}</p>

          <Button variant="orange" size="lg" asChild>
            <a href="https://metamask.io/download/" target="_blank" rel="noopener noreferrer">
              {t("step4.installLink")}
              <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
            </a>
          </Button>

          <p className="mt-4">{t("step4.installing")}</p>
        </div>
      </BattalionNftCard>
    );
  }

  return (
    <BattalionNftCard>
      {/* Header */}
      <div className="text-center">
        <h3 className="!font-rubik font-medium mb-4 max-w-xl mx-auto">{t("step4.title")}</h3>
        <p className="mb-6">{t("step4.description")}</p>
      </div>

      {/* Connected Wallet Display */}
      {connectedAddress ? (
        <>
          <DividerBox color="green" icon="✅" className="!py-4 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="mb-1">{t("step4.success")}</p>
                <p>{shortenAddress(connectedAddress)}</p>
              </div>
              <div className="w-10 h-10 bg-green-950 rounded-full flex items-center justify-center">
                <svg
                  className="w-6 h-6 text-green-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
            </div>
          </DividerBox>

          {/* Next Step Button */}
          <Button
            onClick={() => onWalletConnected(connectedAddress)}
            variant="green"
            className="w-full"
            size="lg"
          >
            <span>{t("step4.nextButton")}</span>
            <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 7l5 5m0 0l-5 5m5-5H6"
              />
            </svg>
          </Button>
        </>
      ) : (
        <>
          {/* MetaMask Info */}
          <DividerBox color="c4" icon="ℹ️" title={t("step4.infoTitle")} className="!py-4 mb-6">
            <p>{t("step4.infoDescription")}</p>
          </DividerBox>

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-900/20 rounded-lg border border-red-700">
              <p className="text-red-200">❌ {error}</p>
            </div>
          )}

          {/* Connect Button */}
          <Button
            onClick={handleConnect}
            disabled={isConnecting}
            variant="c2"
            className="w-full"
            size="lg"
          >
            {isConnecting ? (
              <InlineLoading message={t("step4.connecting")} size="md" className="text-white" />
            ) : (
              <>
                <img src="/MetaMask_Fox.svg" alt="MetaMask" className="w-6 h-6 mr-2" />
                <span>{t("step4.button")}</span>
              </>
            )}
          </Button>
        </>
      )}

      {/* Network Info */}
      <DividerBox color="c4" className="!py-4 mt-6">
        <p>
          <span>{t("step4.networkLabel")}:</span> {networkName}
        </p>
        <p className="mt-1">{t("step4.networkNote")}</p>
      </DividerBox>
    </BattalionNftCard>
  );
};
