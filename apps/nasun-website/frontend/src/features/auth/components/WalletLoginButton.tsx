/**
 * MetaMask Login Button
 *
 * Hybrid desktop/mobile flow:
 * - Desktop: 2-step via window.ethereum (connectWallet + signMessage)
 * - Mobile: 2-trip via MetaMask SDK (connectMetaMaskSDK + signMessageViaSDK)
 *
 * Uses prepare + connect-verify endpoints (address-agnostic server challenge).
 */

import { useState, useRef, forwardRef } from "react";
import { isMetaMaskInstalled, connectWallet, signMessage, revokeAccountPermissions } from "@/utils/metamaskUtils";
import { prepareChallenge, connectVerify } from "@/services/metamaskApi";
import {
  connectMetaMaskSDK,
  signMessageViaSDK,
  disconnectMetaMaskSDK,
} from "@/lib/wallet/metamaskSdkProvider";
import { isMobileBrowser } from "@/utils/mobileDetect";
import type { MetaMaskErrorType } from "@/types/metamask";
import { InlineLoading } from "@/components/ui/InlineLoading";
import logger from "@/lib/logger";
import { trackEvent, AnalyticsEvent } from "@/lib/analytics";

interface WalletLoginButtonProps {
  onSuccess?: (identityId: string, token: string, walletAddress: string) => void;
  onError?: (error: Error, errorType: MetaMaskErrorType) => void;
  className?: string;
}

const WalletLoginButton = forwardRef<HTMLButtonElement, WalletLoginButtonProps>(
  ({ onSuccess, onError, className = "" }, ref) => {
    const [isConnecting, setIsConnecting] = useState(false);
    const [connectStep, setConnectStep] = useState(0); // 0=idle, 1=mobile connect, 2=mobile sign, 3=verifying
    const [errorMessage, setErrorMessage] = useState<string>("");
    const [isSuccess, setIsSuccess] = useState(false);
    const inFlightRef = useRef(false);

    const isMetaMaskEnabled = import.meta.env.VITE_ENABLE_METAMASK_LOGIN === "true";

    if (!isMetaMaskEnabled) {
      return null;
    }

    const handleMetaMaskLogin = async () => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;

      const mobile = isMobileBrowser();
      setErrorMessage("");
      setIsConnecting(true);
      setConnectStep(0);

      trackEvent(AnalyticsEvent.AUTH_METAMASK_START, { platform: mobile ? "mobile" : "desktop" });

      try {
        // Desktop: check MetaMask extension is installed
        if (!mobile && !isMetaMaskInstalled()) {
          throw new Error("MetaMask is not installed. Please install MetaMask browser extension.");
        }

        // Step 1: Get server challenge (no wallet address needed)
        logger.log("[WalletLoginButton] Preparing challenge...");
        const { nonce, message } = await prepareChallenge();

        // Step 2: Connect + sign
        let signature: string;
        if (mobile) {
          // Mobile 2-trip: connect via SDK deep link, then sign
          logger.log("[WalletLoginButton] Mobile — 2-trip flow");
          setConnectStep(1);
          const address = await connectMetaMaskSDK();
          logger.log("[WalletLoginButton] Connected:", address);
          setConnectStep(2);
          signature = await signMessageViaSDK(message, address);
        } else {
          // Desktop: use window.ethereum extension directly (SDK headless mode
          // doesn't trigger extension popups reliably)
          logger.log("[WalletLoginButton] Desktop — extension connect + sign");

          // Revoke stale site permissions so eth_requestAccounts shows a fresh
          // account picker. Without this, MetaMask silently returns the previously
          // connected account even when the user wants to log in with a different one.
          await revokeAccountPermissions();

          const address = await connectWallet();
          logger.log("[WalletLoginButton] Connected account:", address);
          signature = await signMessage(message, address);
        }
        logger.log("[WalletLoginButton] Signature obtained");

        // Step 3: Server verifies signature, recovers address
        setConnectStep(3);
        const authResult = await connectVerify(signature, nonce);
        logger.log("[WalletLoginButton] Verified:", authResult.walletAddress);

        setIsSuccess(true);
        trackEvent(AnalyticsEvent.AUTH_METAMASK_SUCCESS, { platform: mobile ? "mobile" : "desktop" });
        onSuccess?.(authResult.identityId, authResult.token, authResult.walletAddress);
      } catch (error: unknown) {
        console.error("[WalletLoginButton] Login failed:", error);

        const errorMsg = error instanceof Error ? error.message : "An unknown error occurred";
        let userMessage = errorMsg;

        if (errorMsg.includes("User rejected") || errorMsg.includes("rejected")) {
          userMessage = "You rejected the request. Please try again.";
        } else if (errorMsg.includes("not installed")) {
          userMessage = mobile
            ? "Please install the MetaMask app to continue."
            : "MetaMask is not installed. Please install MetaMask extension.";
        } else if (errorMsg.includes("timed out")) {
          userMessage = "Connection timed out. Please try again.";
          await disconnectMetaMaskSDK();
        }

        setErrorMessage(userMessage);
        trackEvent(AnalyticsEvent.AUTH_METAMASK_ERROR, { reason: getErrorType(error) });

        if (onError) {
          const errorType = getErrorType(error);
          onError(error instanceof Error ? error : new Error(errorMsg), errorType);
        }
      } finally {
        setIsConnecting(false);
        setConnectStep(0);
        inFlightRef.current = false;
      }
    };

    const getErrorType = (error: unknown): MetaMaskErrorType => {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("not installed")) return "NO_METAMASK" as MetaMaskErrorType;
      if (message.includes("rejected")) return "USER_REJECTED" as MetaMaskErrorType;
      if (message.includes("timed out")) return "SIGNATURE_FAILED" as MetaMaskErrorType;
      return "UNKNOWN" as MetaMaskErrorType;
    };

    const getButtonText = () => {
      if (isSuccess) return "Authenticated!";
      if (!isConnecting) return errorMessage ? "Try Again" : "Continue with MetaMask";

      if (connectStep === 1) return "Connecting wallet... (1/2)";
      if (connectStep === 2) return "Sign in MetaMask (2/2)";
      if (connectStep === 3) return "Verifying...";
      return "Connecting...";
    };

    return (
      <>
        <button
          ref={ref}
          onClick={handleMetaMaskLogin}
          disabled={isConnecting || isSuccess}
          className={className}
        >
          <img src="/MetaMask_Fox.svg" alt="MetaMask" className="w-6 h-6 flex-shrink-0" />
          <span>{getButtonText()}</span>
          {isConnecting && <InlineLoading size="sm" className="ml-auto" />}
        </button>

        {errorMessage && <div className="text-sm text-red-400 px-2 py-1">{errorMessage}</div>}
      </>
    );
  },
);

WalletLoginButton.displayName = "WalletLoginButton";

export default WalletLoginButton;
