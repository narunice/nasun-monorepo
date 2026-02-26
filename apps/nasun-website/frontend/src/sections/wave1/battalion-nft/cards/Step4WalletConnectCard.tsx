/**
 * Wallet Connect Card Component
 *
 * @description
 * MetaMask SDK를 사용한 지갑 연결 카드 컴포넌트
 * Hybrid flow: prepare → connect+sign → connect-verify
 * - Desktop: 1-trip connectAndSign (extension popup)
 * - Mobile: 2-trip fallback (connect → sign) — connectAndSign broken on iOS MetaMask
 *
 * @author Claude Code
 * @date 2025-10-25
 * @updated 2026-02-26 - Hybrid desktop/mobile flow for iOS Safari compatibility
 */

import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/features/auth";
import { refreshAndSaveUserProfile } from "@/features/auth/services/userProfileService";
import { useBattalionNftStore } from "../../../../stores/useBattalionNftStore";
import {
  connectAndSignSDK,
  connectMetaMaskSDK,
  signMessageViaSDK,
  disconnectMetaMaskSDK,
} from "../../../../lib/wallet/metamaskSdkProvider";
import { isMobileBrowser } from "../../../../utils/mobileDetect";
import { prepareChallenge, connectVerify } from "../../../../services/metamaskApi";
import { ButtonV3 } from "@/components/ui/button-v3";
import logger from "../../../../lib/logger";
import { InlineLoading, DividerBox, OuterBox } from "@/components/ui";

interface WalletConnectCardProps {
  onWalletConnected: (address: string) => void;
}

export const WalletConnectCard: React.FC<WalletConnectCardProps> = ({ onWalletConnected }) => {
  const { t } = useTranslation("battalion-nft");
  const { user } = useAuth();
  const { cognitoIdentityId, cognitoToken: storeCognitoToken, setWalletProof } = useBattalionNftStore();
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectStep, setConnectStep] = useState(0); // 0=idle, 1=mobile connect, 2=mobile sign, 3=verifying
  const [connectedAddress, setConnectedAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Restore connected state from linked account profile
  useEffect(() => {
    const linkedWallet = user?.linkedAccounts?.metamask?.walletAddress;
    if (linkedWallet) {
      logger.log("[WalletConnectCard] Wallet already linked:", linkedWallet);
      setConnectedAddress(linkedWallet.toLowerCase());
    } else {
      setConnectedAddress(null);
    }
  }, [user]);

  /**
   * 1-trip connect handler:
   * 1. /prepare → nonce + message (HTTP only)
   * 2. connectAndSign → signature (single MetaMask trip)
   * 3. /connect-verify → walletAddress + auth tokens (HTTP only)
   */
  const handleConnect = async () => {
    try {
      setIsConnecting(true);
      setError(null);

      // Step 1: Get server-generated nonce + message
      const { nonce, message } = await prepareChallenge();
      logger.log("[WalletConnectCard] Challenge prepared");

      // Step 2: Connect + sign
      // Desktop: single-trip connectAndSign (extension popup handles both)
      // Mobile: 2-trip fallback (connectAndSign broken on iOS MetaMask app)
      let signature: string;
      if (isMobileBrowser()) {
        logger.log("[WalletConnectCard] Mobile detected — using 2-trip flow");
        setConnectStep(1);
        const address = await connectMetaMaskSDK();
        logger.log("[WalletConnectCard] Connected:", address);
        setConnectStep(2);
        signature = await signMessageViaSDK(message, address);
      } else {
        logger.log("[WalletConnectCard] Desktop detected — using 1-trip connectAndSign");
        signature = await connectAndSignSDK(message);
      }
      logger.log("[WalletConnectCard] Signature obtained");

      // Step 3: Server verifies signature, recovers address, issues Cognito identity
      setConnectStep(3);
      const authResult = await connectVerify(signature, nonce);
      const walletAddress = authResult.walletAddress;
      logger.log("[WalletConnectCard] Verification successful:", walletAddress);

      // Store wallet proof
      if (authResult.walletProof && authResult.proofIssuedAt) {
        setWalletProof(authResult.walletProof, authResult.proofIssuedAt);
      }

      // Link accounts if not already linked
      const linkedWallet = user?.linkedAccounts?.metamask?.walletAddress;
      if (!linkedWallet) {
        const primaryIdentityId = cognitoIdentityId || user?.identityId;
        if (!primaryIdentityId) {
          throw new Error("Missing Cognito identity ID. Please restart the event from Step 1.");
        }

        const linkAccountApi = import.meta.env.VITE_LINK_ACCOUNT_API;
        if (!linkAccountApi) {
          throw new Error("Link Account API is not configured");
        }

        const linkHeaders: Record<string, string> = {
          "Content-Type": "application/json",
        };
        const cognitoToken = storeCognitoToken || user?.cognitoToken;
        if (cognitoToken) {
          linkHeaders["Authorization"] = `Bearer ${cognitoToken}`;
        }

        const linkResponse = await fetch(linkAccountApi, {
          method: "POST",
          headers: linkHeaders,
          body: JSON.stringify({
            primaryIdentityId,
            secondaryIdentityId: authResult.identityId,
            secondaryProvider: "MetaMask",
          }),
        });

        if (!linkResponse.ok) {
          const errorBody = await linkResponse.text();
          console.error("[WalletConnectCard] Link API error:", linkResponse.status, errorBody);
          throw new Error(`Failed to link MetaMask account: ${linkResponse.status} ${errorBody}`);
        }

        logger.log("[WalletConnectCard] Account linked successfully");
        await refreshAndSaveUserProfile(primaryIdentityId);
        logger.log("[WalletConnectCard] User profile refreshed and saved");
      }

      setConnectedAddress(walletAddress);
      onWalletConnected(walletAddress);
    } catch (err: unknown) {
      console.error("[WalletConnectCard] Connection error:", err);
      const errorMessage =
        err instanceof Error ? err.message : t("step4.errors.connectionFailed");
      setError(errorMessage);

      // Reset SDK on timeout or unrecoverable errors
      if (err instanceof Error && err.message.includes("timed out")) {
        await disconnectMetaMaskSDK();
      }
    } finally {
      setIsConnecting(false);
      setConnectStep(0);
    }
  };

  const shortenAddress = (address: string): string => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  return (
    <OuterBox color="nw0" className=" max-w-3xl mx-auto">
      {/* Header */}
      <div className="text-center">
        <h4 className="!font-rubik font-medium mb-4 max-w-xl mx-auto">{t("step4.title")}</h4>
        <p className="mb-6">{t("step4.description")}</p>
      </div>

      {/* Connected Wallet Display */}
      {connectedAddress ? (
        <>
          <DividerBox color="green" padding="sm" icon="✅" className="mb-6">
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
          <ButtonV3
            onClick={handleConnect}
            disabled={isConnecting}
            variant="green"
            size="lg"
            className="flex mx-auto"
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
          </ButtonV3>
        </>
      ) : (
        <>
          {/* Info Box */}
          <DividerBox
            color="nw3"
            padding="sm"
            icon="ℹ️"
            title={t("step4.infoTitle")}
            className="mb-6 !bg-black/60"
            titleClassName="!text-nasun-nw4"
            hideDivider={true}
          >
            <p className="pt-2">{t("step4.infoDescription")}</p>
            <p className="mt-2 text-yellow-200"> {t("step4.signatureNote")}</p>
            <p className="mt-2 text-nasun-nw4/60 text-sm">{t("step4.mobileReturnHint")}</p>
          </DividerBox>

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-900/20 rounded-lg border border-red-700">
              <p className="text-red-200">{error}</p>
            </div>
          )}

          {/* Primary Connect Button */}
          <ButtonV3
            onClick={handleConnect}
            disabled={isConnecting}
            variant="nw1"
            size="lg"
            className={isConnecting && connectStep > 0 ? "w-full" : "flex mx-auto"}
          >
            {isConnecting ? (
              connectStep === 1 || connectStep === 2 ? (
                <div className="flex flex-col items-center gap-1 py-1">
                  <div className="flex items-center gap-2">
                    <svg
                      className="animate-spin h-5 w-5 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    <span className="text-white font-bold text-lg">{connectStep} / 2</span>
                  </div>
                  <span className="text-white/90 text-base">
                    {connectStep === 1 ? t("step4.connectingStep1") : t("step4.connectingStep2")}
                  </span>
                </div>
              ) : (
                <InlineLoading
                  message={connectStep === 3 ? t("step4.verifying") : t("step4.connecting")}
                  size="md"
                  className="text-white"
                />
              )
            ) : (
              <>
                <img src="/MetaMask_Fox.svg" alt="MetaMask" className="w-6 h-6 mr-2" />
                <span>{t("step4.button")}</span>
              </>
            )}
          </ButtonV3>
        </>
      )}
    </OuterBox>
  );
};
