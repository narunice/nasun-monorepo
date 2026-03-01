/**
 * Wallet Connect Card Component
 *
 * @description
 * MetaMask 지갑 연결 카드 컴포넌트
 * Hybrid flow: prepare → connect + sign → connect-verify
 * - Desktop: 2-step via window.ethereum (connectWallet + signMessage)
 * - Mobile: 2-trip via MetaMask SDK (connect → sign deep links)
 *
 * @author Claude Code
 * @date 2025-10-25
 * @updated 2026-03-01 - Desktop: SDK headless → window.ethereum direct for extension popup
 */

import React, { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/features/auth";
import { refreshAndSaveUserProfile } from "@/features/auth/services/userProfileService";
import { useBattalionNftStore } from "../../../../stores/useBattalionNftStore";
import {
  connectMetaMaskSDK,
  signMessageViaSDK,
  disconnectMetaMaskSDK,
} from "../../../../lib/wallet/metamaskSdkProvider";
import { connectWallet, signMessage, isMetaMaskInstalled } from "../../../../utils/metamaskUtils";
import { isMobileBrowser } from "../../../../utils/mobileDetect";
import { prepareChallenge, connectVerify } from "../../../../services/metamaskApi";
import { ButtonV3 } from "@/components/ui/button-v3";
import logger from "../../../../lib/logger";
import { InlineLoading, DividerBox, OuterBox, Spinner } from "@/components/ui";

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
  const [mobileInstallHint, setMobileInstallHint] = useState(false);
  const inFlightRef = useRef(false);

  // NOTE: No auto-restore from profile. The user must freshly connect MetaMask
  // on each Step 4 visit to get a valid walletProof (in-memory only, lost on reload).
  // Profile's linkedAccounts.metamask.walletAddress can be stale (different wallet
  // from a previous session). connectedAddress is set only by handleConnect().

  /**
   * Connect handler:
   * 1. /prepare → nonce + message (HTTP only)
   * 2. connect + sign → signature (desktop: extension, mobile: SDK deep links)
   * 3. /connect-verify → walletAddress + auth tokens (HTTP only)
   */
  const handleConnect = async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    const mobile = isMobileBrowser();

    try {
      setIsConnecting(true);
      setError(null);
      setMobileInstallHint(false);

      // Desktop: check MetaMask extension is installed
      if (!mobile && !isMetaMaskInstalled()) {
        throw new Error("MetaMask is not installed. Please install MetaMask browser extension.");
      }

      // Step 1: Get server-generated nonce + message
      const { nonce, message } = await prepareChallenge();
      logger.log("[WalletConnectCard] Challenge prepared");

      // Step 2: Connect + sign
      // Desktop: 2-step via window.ethereum (extension popup)
      // Mobile: 2-trip via MetaMask SDK (deep links to MetaMask app)
      let signature: string;
      if (mobile) {
        logger.log("[WalletConnectCard] Mobile detected — using 2-trip flow");
        setConnectStep(1);
        const address = await connectMetaMaskSDK({
          onAppNotDetected: () => setMobileInstallHint(true),
        });
        logger.log("[WalletConnectCard] Connected:", address);
        setConnectStep(2);
        signature = await signMessageViaSDK(message, address);
      } else {
        logger.log("[WalletConnectCard] Desktop detected — extension connect + sign");
        const address = await connectWallet();
        signature = await signMessage(message, address);
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

      // Link accounts if not linked, or re-link if the profile wallet differs from the actual wallet.
      // Stale profile data can occur when a previous session linked a different wallet to this identity.
      const linkedWallet = user?.linkedAccounts?.metamask?.walletAddress;
      const needsLink = !linkedWallet || linkedWallet.toLowerCase() !== walletAddress.toLowerCase();

      if (needsLink) {
        // Use X identity (from Step 2) as primary so that the X account's profile
        // gets the MetaMask wallet linked. This ensures test_handle's profile has
        // linkedAccounts.metamask.walletAddress = wallet B, and wallet B's profile
        // gets a reverse link with twitterId.
        const primaryIdentityId = cognitoIdentityId || user?.identityId;
        if (!primaryIdentityId) {
          throw new Error("Missing Cognito identity ID. Please restart the event from Step 1.");
        }

        // Only call link-account when the identities are different (avoid self-linking)
        if (primaryIdentityId !== authResult.identityId) {
          const linkAccountApi = import.meta.env.VITE_LINK_ACCOUNT_API;
          if (!linkAccountApi) {
            throw new Error("Link Account API is not configured");
          }

          const linkHeaders: Record<string, string> = {
            "Content-Type": "application/json",
          };
          // Use X identity's token to match primaryIdentityId
          // (link-account Lambda verifies primaryIdentityId === authenticatedIdentityId)
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
        }

        // Always refresh profile to sync the wallet address
        await refreshAndSaveUserProfile(user?.identityId || primaryIdentityId);
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
      inFlightRef.current = false;
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

          {/* Mobile install hint (shown during connection if MetaMask app not detected) */}
          {isConnecting && mobileInstallHint && (
            <div className="mb-6 p-4 bg-orange-900/30 rounded-lg border border-orange-600">
              <p className="text-orange-200">
                MetaMask app not detected on your device.{" "}
                <a
                  href="https://metamask.io/download/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline text-orange-100 hover:text-white font-medium"
                >
                  Install MetaMask
                </a>
              </p>
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
                    <Spinner size="sm" />
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
