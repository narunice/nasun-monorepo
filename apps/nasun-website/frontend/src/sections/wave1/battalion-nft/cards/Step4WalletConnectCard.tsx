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
import { useAccount, useSignMessage, useDisconnect } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAuth } from "@/features/auth";
import { refreshAndSaveUserProfile } from "@/features/auth/services/userProfileService";
import { useBattalionNftStore } from "../../../../stores/useBattalionNftStore";
import { prepareChallenge, connectVerify } from "../../../../services/metamaskApi";
import { ButtonV3 } from "@/components/ui/button-v3";
import logger from "../../../../lib/logger";
import { InlineLoading, DividerBox, OuterBox } from "@/components/ui";
import { isMetaMaskInAppBrowser } from "@/utils/mobileDetect";

interface WalletConnectCardProps {
  onWalletConnected: (address: string) => void;
}

export const WalletConnectCard: React.FC<WalletConnectCardProps> = ({ onWalletConnected }) => {
  const { user } = useAuth();
  const {
    cognitoIdentityId,
    cognitoToken: storeCognitoToken,
    setWalletProof,
  } = useBattalionNftStore();

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
  // Skip in MetaMask in-app browser — injected provider has no stale WC sessions.
  useEffect(() => {
    if (isConnected && !isMetaMaskInAppBrowser()) {
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
      // WC v2's built-in handleDeeplinkRedirect() opens the wallet app automatically.
      // Do NOT add explicit deep-links — they conflict with WC's built-in mechanism.
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
            "Please open your wallet app and approve/reject it, then try again.",
        );
      } else {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to connect wallet";
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
    isConnected,
    address,
    connector,
    signMessageAsync,
    disconnectAsync,
    user,
    cognitoIdentityId,
    storeCognitoToken,
    setWalletProof,
    onWalletConnected,
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
        <h4 className="!font-rubik font-medium mb-4 max-w-xl mx-auto">Connect Wallet</h4>
        <p className="mb-6">Please select your preferred wallet when prompted.</p>
      </div>

      {/* Connected Wallet Display */}
      {connectedAddress ? (
        <>
          <DividerBox color="green" padding="sm" icon="✅" className="mb-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="mb-1">Wallet connected successfully</p>
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
            <span>Next Step</span>
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
          {/* Info Box - hidden once signing phase begins */}
          {!isAuthenticating && (
            <DividerBox color="nw4" padding="sm" className="mb-6 !bg-black/30">
              <p>{"⚠️ Signing only confirms wallet ownership to collect a valid address. No transactions or fund transfers occur."}</p>
              {!isMetaMaskInAppBrowser() && (
                <>
                  <p className="mt-2 text-yellow-300 text-sm md:hidden">{"📱 On mobile, select WalletConnect first to open your preferred wallet app. You'll approve twice: once to connect, once to sign."}</p>
                  <p className="mt-1 text-yellow-300 text-sm md:hidden">{"If you experience issues completing registration on mobile, please try again on a desktop browser."}</p>
                </>
              )}
            </DividerBox>
          )}

          {/* Signing guidance - shown when WC sign request is sent via relay */}
          {showWalletHint && (
            <DividerBox color="nw4" padding="sm" className="mb-6 !bg-black/30">
              <p>Approve the signature in your wallet app.</p>
              <p className="mt-2 text-sm text-nasun-nw4 md:hidden">Having trouble on mobile? A desktop browser gives the most reliable experience.</p>
            </DividerBox>
          )}

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-900/20 rounded-lg border border-red-700">
              <p className="text-red-200">{error}</p>
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

                  // In MetaMask in-app browser, wallet may already be connected
                  // via injected provider. openConnectModal is a no-op when connected,
                  // so authenticate directly instead.
                  if (isConnected && address) {
                    handleAuthenticate();
                  } else {
                    openConnectModal();
                  }
                }}
                disabled={isAuthenticating}
                variant="nw1"
                size="lg"
                className="flex mx-auto"
              >
                {isAuthenticating ? (
                  <InlineLoading message="Connecting..." size="md" className="text-white" />
                ) : (
                  <span>Connect Wallet</span>
                )}
              </ButtonV3>
            )}
          </ConnectButton.Custom>
        </>
      )}
    </OuterBox>
  );
};
