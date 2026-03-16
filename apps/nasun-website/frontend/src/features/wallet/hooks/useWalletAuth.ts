/**
 * useWalletAuth Hook
 *
 * Unified EVM wallet authentication via wagmi + RainbowKit.
 * Replaces useMetaMaskConnection (MetaMask SDK-specific).
 *
 * Supports two modes:
 * - 'login': Authenticate and sign in with any EVM wallet
 * - 'link': Link a wallet to an existing account
 *
 * Flow: openConnectModal → user selects wallet → prepareChallenge → signMessage → connectVerify
 *
 * Reference implementation: Step4WalletConnectCard.tsx (Battalion NFT)
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { useAccount, useSignMessage, useDisconnect } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useAuth } from "@/features/auth";
import { prepareChallenge, connectVerify } from "@/services/metamaskApi";
import { refreshAndSaveUserProfile } from "@/features/auth/services/userProfileService";
import { useBattalionNftStore } from "@/stores/useBattalionNftStore";
import logger from "@/lib/logger";

export type WalletAuthMode = "login" | "link";

export interface UseWalletAuthOptions {
  mode: WalletAuthMode;
  onSuccess?: (walletAddress: string) => void;
  onError?: (error: Error) => void;
}

export interface UseWalletAuthReturn {
  connect: () => Promise<void>;
  isAuthenticating: boolean;
  error: string | null;
}

export function useWalletAuth(options: UseWalletAuthOptions): UseWalletAuthReturn {
  const { mode } = options;
  const { user, signInWithWallet } = useAuth();

  const { address, isConnected, connector } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { disconnectAsync } = useDisconnect();
  const { openConnectModal } = useConnectModal();

  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stable refs for callbacks to avoid dependency array churn
  const onSuccessRef = useRef(options.onSuccess);
  const onErrorRef = useRef(options.onError);
  useEffect(() => {
    onSuccessRef.current = options.onSuccess;
    onErrorRef.current = options.onError;
  }, [options.onSuccess, options.onError]);

  // Ref for openConnectModal — RainbowKit returns undefined when already connected,
  // so we need the latest value after disconnect completes and React re-renders.
  const openConnectModalRef = useRef(openConnectModal);
  useEffect(() => {
    openConnectModalRef.current = openConnectModal;
  }, [openConnectModal]);

  // Guards: pendingAuthRef = user clicked Connect,
  // authTriggeredRef = prevent double-firing in useEffect
  const pendingAuthRef = useRef(false);
  const authTriggeredRef = useRef(false);
  // Tracks whether we need to open the modal after disconnect completes
  const pendingModalRef = useRef(false);

  // Open the connect modal after disconnect completes.
  // When wallet was auto-connected, openConnectModal is undefined.
  // After disconnectAsync(), React re-renders and openConnectModal becomes available.
  // This effect catches that transition and opens the modal.
  useEffect(() => {
    if (pendingModalRef.current && !isConnected && openConnectModal) {
      pendingModalRef.current = false;
      openConnectModal();
    }
  }, [isConnected, openConnectModal]);

  /**
   * Authenticate after wallet connects via RainbowKit modal:
   * 1. /prepare → nonce + message (address-agnostic)
   * 2. signMessageAsync → signature (wagmi handles extension popup / WC relay)
   * 3. /connect-verify → walletAddress + identityId + token
   * 4. Mode-specific: login (auth context) or link (API call + profile refresh)
   */
  const handleAuthenticate = useCallback(async () => {
    if (!isConnected || !address) return;

    // Early validation for link mode
    if (mode === "link" && !user) {
      setError("Please sign in first to link a wallet.");
      pendingAuthRef.current = false;
      authTriggeredRef.current = false;
      return;
    }

    setIsAuthenticating(true);
    setError(null);

    try {
      const { nonce, message } = await prepareChallenge();
      logger.log("[useWalletAuth] Challenge prepared");

      // WC v2's built-in handleDeeplinkRedirect() opens the wallet app automatically.
      // Do NOT add explicit deep-links — they conflict with WC's built-in mechanism.
      const signature = await signMessageAsync({ message });
      logger.log("[useWalletAuth] Signature obtained");

      const authResult = await connectVerify(signature, nonce);
      const walletAddress = authResult.walletAddress;
      logger.log("[useWalletAuth] Verified:", walletAddress);

      if (mode === "login") {
        await signInWithWallet(authResult.identityId, authResult.token, walletAddress, connector?.name);
      } else {
        // Link mode: attach wallet to existing account
        if (!user) throw new Error("User must be logged in to link wallet");

        if (user.identityId !== authResult.identityId) {
          const linkAccountApi = import.meta.env.VITE_LINK_ACCOUNT_API;
          if (!linkAccountApi) throw new Error("Link Account API is not configured");

          const token = user.cognitoToken ?? useBattalionNftStore.getState().cognitoToken;
          if (!token) throw new Error("Session expired. Please sign in again to link accounts.");

          const response = await fetch(linkAccountApi, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              primaryIdentityId: user.identityId,
              secondaryIdentityId: authResult.identityId,
              secondaryProvider: "MetaMask",
            }),
          });

          if (!response.ok) {
            if (response.status === 401) {
              throw new Error("Session expired. Please sign in again to link accounts.");
            }
            const body = await response.text();
            throw new Error(`Failed to link wallet: ${response.status} ${body}`);
          }

          logger.log("[useWalletAuth] Account linked");
        }

        await refreshAndSaveUserProfile(user.identityId);
        logger.log("[useWalletAuth] Profile refreshed");
      }

      onSuccessRef.current?.(walletAddress);
    } catch (err: unknown) {
      console.error("[useWalletAuth] Error:", err);

      let msg: string;
      if (err instanceof Error) {
        const lowerMsg = err.message.toLowerCase();
        if (lowerMsg.includes("already pending")) {
          msg =
            "A previous signing request is still pending. " +
            "Please open your wallet app and approve/reject it, then try again.";
        } else if (
          lowerMsg.includes("rejected") ||
          lowerMsg.includes("denied") ||
          lowerMsg.includes("cancelled") ||
          lowerMsg.includes("user refused")
        ) {
          msg = "You rejected the request. Please try again.";
        } else {
          msg = err.message;
        }
      } else {
        msg = "Wallet authentication failed";
      }

      setError(msg);
      onErrorRef.current?.(err instanceof Error ? err : new Error(msg));

      // Disconnect on error for a clean retry
      try {
        await disconnectAsync();
      } catch {
        /* ignore disconnect errors */
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
    mode,
    user,
    signInWithWallet,
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

  // Mobile: re-check connection when browser tab becomes visible again.
  // On mobile, the browser is backgrounded while the user approves in the wallet app.
  // The useEffect above may not fire until a re-render occurs, so this listener
  // ensures immediate auth trigger when the user returns to the browser.
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return;
      if (!pendingAuthRef.current || authTriggeredRef.current || isAuthenticating) return;
      if (isConnected && address) {
        authTriggeredRef.current = true;
        handleAuthenticate();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [isConnected, address, isAuthenticating, handleAuthenticate]);

  const connect = useCallback(async () => {
    pendingAuthRef.current = true;
    authTriggeredRef.current = false;
    setError(null);

    if (isConnected) {
      // Wallet already connected (e.g., auto-reconnect from extension).
      // RainbowKit's openConnectModal is undefined when connected,
      // so we disconnect first and let the useEffect open the modal
      // once openConnectModal becomes available on re-render.
      pendingModalRef.current = true;
      try {
        await disconnectAsync();
      } catch (err) {
        logger.warn("[useWalletAuth] Failed to disconnect stale session:", err);
        pendingModalRef.current = false;
      }
    } else {
      // Not connected — open modal immediately using the latest ref
      openConnectModalRef.current?.();
    }
  }, [isConnected, disconnectAsync]);

  return { connect, isAuthenticating, error };
}
