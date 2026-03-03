/**
 * Wallet Login Button
 *
 * Opens RainbowKit modal for multi-wallet login (MetaMask, Coinbase, WalletConnect, etc.).
 * Uses wagmi + RainbowKit instead of MetaMask SDK.
 *
 * Flow: click → RainbowKit modal → select wallet → prepareChallenge → sign → connectVerify → login
 */

import { forwardRef } from "react";
import { useWalletAuth } from "@/features/wallet/hooks/useWalletAuth";
import { InlineLoading } from "@/components/ui/InlineLoading";
import { trackEvent, AnalyticsEvent } from "@/lib/analytics";

interface WalletLoginButtonProps {
  onSuccess?: (walletAddress: string) => void;
  onError?: (error: Error) => void;
  className?: string;
}

const WalletLoginButton = forwardRef<HTMLButtonElement, WalletLoginButtonProps>(
  ({ onSuccess, onError, className = "" }, ref) => {
    const isEnabled = import.meta.env.VITE_ENABLE_WALLET_LOGIN === "true";

    const { connect, isAuthenticating, error } = useWalletAuth({
      mode: "login",
      onSuccess: (walletAddress) => {
        trackEvent(AnalyticsEvent.AUTH_WALLET_SUCCESS, {});
        onSuccess?.(walletAddress);
      },
      onError: (err) => {
        trackEvent(AnalyticsEvent.AUTH_WALLET_ERROR, { reason: err.message });
        onError?.(err);
      },
    });

    if (!isEnabled) return null;

    const handleClick = () => {
      trackEvent(AnalyticsEvent.AUTH_WALLET_START, {});
      connect();
    };

    const buttonText = isAuthenticating
      ? "Connecting..."
      : error
        ? "Try Again"
        : "Continue with Wallet";

    return (
      <>
        <button
          ref={ref}
          onClick={handleClick}
          disabled={isAuthenticating}
          className={className}
        >
          <svg
            className="w-6 h-6 flex-shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 12a2.25 2.25 0 0 0-2.25-2.25H15a3 3 0 1 1 0-6h.75A2.25 2.25 0 0 1 18 6v0a2.25 2.25 0 0 1-2.25 2.25H15m6 3.75v3a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25A2.25 2.25 0 0 1 5.25 3h13.5A2.25 2.25 0 0 1 21 5.25v6.75Z"
            />
          </svg>
          <span>{buttonText}</span>
          {isAuthenticating && <InlineLoading size="sm" className="ml-auto" />}
        </button>

        {error && <div className="text-sm text-red-400 px-2 py-1">{error}</div>}
      </>
    );
  },
);

WalletLoginButton.displayName = "WalletLoginButton";

export default WalletLoginButton;
