/**
 * Wallet Connect Card Component
 *
 * @description
 * EVM wallet connection card (MetaMask, Rabby, Coinbase, WalletConnect).
 * Uses wagmi hooks + RainbowKit for multi-wallet support.
 * Flow: openConnectModal → connect → prepare → sign → connect-verify
 *
 * @author Claude Code
 * @date 2025-10-25
 * @updated 2026-03-02 - Migrated from MetaMask-only to wagmi + RainbowKit multi-wallet
 */

import React, { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useAccount, useSignMessage, useDisconnect } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAuth } from "@/features/auth";
import { refreshAndSaveUserProfile } from "@/features/auth/services/userProfileService";
import { useBattalionNftStore } from "../../../../stores/useBattalionNftStore";
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

  const { address, isConnected, connector } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { disconnectAsync } = useDisconnect();

  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [connectedAddress, setConnectedAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showWalletHint, setShowWalletHint] = useState(false);

  // Guards: pendingAuthRef = user clicked "Connect Wallet",
  // authTriggeredRef = prevent double-firing in useEffect
  const pendingAuthRef = useRef(false);
  const authTriggeredRef = useRef(false);

  // Disconnect stale wagmi session on mount so the wallet selection modal
  // always appears. walletProof is memory-only — a fresh connect is required.
  useEffect(() => {
    if (isConnected) {
      disconnectAsync().catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount-only

  /**
   * Authenticate after wallet is connected:
   * 1. /prepare → nonce + message
   * 2. signMessageAsync → signature (wagmi handles extension popup / WC relay)
   * 3. /connect-verify → walletAddress + walletProof
   * 4. Account linking (unchanged from original)
   */
  const handleAuthenticate = useCallback(async () => {
    if (!isConnected || !address) return;

    const isWC = connector?.type === "walletConnect";

    setIsAuthenticating(true);
    setError(null);
    setShowWalletHint(false);

    try {
      // Step 1: Get server-generated nonce + message
      const { nonce, message } = await prepareChallenge();
      logger.log("[WalletConnectCard] Challenge prepared");

      // Step 2: Sign message via wagmi
      if (isWC) {
        setShowWalletHint(true);
        logger.log("[WalletConnectCard] Sending sign request via WalletConnect relay...");
      }

      const signature = await signMessageAsync({ message });
      setShowWalletHint(false);
      logger.log("[WalletConnectCard] Signature obtained");

      // Step 3: Server verifies signature, recovers address, issues Cognito identity
      const authResult = await connectVerify(signature, nonce);
      const walletAddress = authResult.walletAddress;
      logger.log("[WalletConnectCard] Verification successful:", walletAddress);

      // Store wallet proof (memory-only, not persisted to localStorage)
      if (authResult.walletProof && authResult.proofIssuedAt) {
        setWalletProof(authResult.walletProof, authResult.proofIssuedAt);
      }

      // Link accounts if not linked, or re-link if the profile wallet differs
      const linkedWallet = user?.linkedAccounts?.metamask?.walletAddress;
      const needsLink = !linkedWallet || linkedWallet.toLowerCase() !== walletAddress.toLowerCase();

      if (needsLink) {
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
              secondaryProvider: connector?.name ?? "EVM Wallet",
            }),
          });

          if (!linkResponse.ok) {
            const errorBody = await linkResponse.text();
            console.error("[WalletConnectCard] Link API error:", linkResponse.status, errorBody);
            throw new Error(`Failed to link wallet account: ${linkResponse.status} ${errorBody}`);
          }

          logger.log("[WalletConnectCard] Account linked successfully");
        }

        await refreshAndSaveUserProfile(user?.identityId || primaryIdentityId);
        logger.log("[WalletConnectCard] User profile refreshed and saved");
      }

      setConnectedAddress(walletAddress);
      onWalletConnected(walletAddress);
    } catch (err: unknown) {
      console.error("[WalletConnectCard] Auth error:", err);
      setShowWalletHint(false);

      if (err instanceof Error && err.message.includes("already pending")) {
        setError(
          "A previous signing request is still pending. " +
          "Please open your wallet app and approve/reject it, then try again."
        );
      } else {
        const errorMessage =
          err instanceof Error ? err.message : t("step4.errors.connectionFailed");
        setError(errorMessage);
      }

      // Disconnect on error for a clean retry
      try {
        await disconnectAsync();
      } catch {
        // ignore disconnect errors
      }

      pendingAuthRef.current = false;
      authTriggeredRef.current = false;
    } finally {
      setIsAuthenticating(false);
    }
  }, [
    isConnected, address, connector, signMessageAsync, disconnectAsync,
    t, user, cognitoIdentityId, storeCognitoToken,
    setWalletProof, onWalletConnected,
  ]);

  // Auto-trigger authentication after wallet connects via RainbowKit modal
  useEffect(() => {
    if (
      isConnected &&
      address &&
      pendingAuthRef.current &&
      !authTriggeredRef.current &&
      !isAuthenticating
    ) {
      authTriggeredRef.current = true;
      handleAuthenticate();
    }
  }, [isConnected, address, isAuthenticating, handleAuthenticate]);

  const shortenAddress = (addr: string): string => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
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
            onClick={() => onWalletConnected(connectedAddress)}
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

          {/* WalletConnect signing hint (shown when sign request sent via relay) */}
          {showWalletHint && (
            <div className="mb-6 p-4 bg-yellow-900/30 rounded-lg border border-yellow-600">
              <p className="text-yellow-200">
                {t("step4.connectingStep2")}
              </p>
            </div>
          )}

          {/* Primary Connect Button */}
          <ConnectButton.Custom>
            {({ openConnectModal }) => (
              <ButtonV3
                onClick={() => {
                  pendingAuthRef.current = true;
                  authTriggeredRef.current = false;
                  setError(null);
                  openConnectModal();
                }}
                disabled={isAuthenticating}
                variant="nw1"
                size="lg"
                className="flex mx-auto"
              >
                {isAuthenticating ? (
                  <InlineLoading
                    message={t("step4.connecting")}
                    size="md"
                    className="text-white"
                  />
                ) : (
                  <span>{t("step4.button")}</span>
                )}
              </ButtonV3>
            )}
          </ConnectButton.Custom>
        </>
      )}
    </OuterBox>
  );
};
