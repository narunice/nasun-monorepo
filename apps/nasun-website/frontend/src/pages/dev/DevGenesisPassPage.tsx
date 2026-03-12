/**
 * Genesis Pass Allowlist Registration Page
 *
 * /dev/genesis-pass (PrivateRoute - requires Nasun wallet login)
 *
 * Two scenarios:
 * A) MetaMask already linked: Register directly (no signature, works on all devices)
 * B) MetaMask not linked: useWalletAuth link flow, with mobile environment handling
 */

import { useState, useEffect, useCallback } from "react";
import { PageLayout } from "@/components/layout/PageLayout";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { ButtonV3 } from "@/components/ui/button-v3";
import { useAuth } from "@/features/auth";
import { useWalletAuth } from "@/features/wallet/hooks/useWalletAuth";
import { useBattalionNftStore } from "@/stores/useBattalionNftStore";
import {
  isMobileBrowser,
  isAndroidBrowser,
  isMetaMaskInAppBrowser,
  isIOSSafari,
} from "@/utils/mobileDetect";
import {
  registerGenesisPass,
  checkGenesisPass,
  GenesisPassApiError,
} from "@/services/genesisPassApi";
import logger from "@/lib/logger";

type RegistrationStatus = "idle" | "checking" | "loading" | "registered" | "error";

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

const DevGenesisPassPage = () => {
  const { user } = useAuth();
  const [status, setStatus] = useState<RegistrationStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [registeredAt, setRegisteredAt] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  const linkedWalletAddress = user?.linkedAccounts?.metamask?.walletAddress
    || (user?.provider === "MetaMask" ? user.walletAddress : undefined);
  const hasLinkedMetaMask = !!linkedWalletAddress;

  // Mobile environment detection (only relevant for Scenario B)
  const needsWalletConnect = !hasLinkedMetaMask;
  const isMobileBlocked =
    needsWalletConnect &&
    isMobileBrowser() &&
    !isIOSSafari() &&
    !isMetaMaskInAppBrowser();

  // Check existing registration on mount
  useEffect(() => {
    if (!linkedWalletAddress) return;

    const checkStatus = async () => {
      setStatus("checking");
      try {
        const result = await checkGenesisPass(linkedWalletAddress);
        if (result.data.registered) {
          setStatus("registered");
          setRegisteredAt(result.data.registeredAt || null);
        } else {
          setStatus("idle");
        }
      } catch (err) {
        logger.warn("[GenesisPass] Failed to check status:", err);
        setStatus("idle");
      }
    };

    checkStatus();
  }, [linkedWalletAddress]);

  // Get cognitoToken with fallback pattern
  const getCognitoToken = useCallback((): string | null => {
    return user?.cognitoToken ?? useBattalionNftStore.getState().cognitoToken ?? null;
  }, [user?.cognitoToken]);

  // Register allowlist (called after wallet is linked or directly for Scenario A)
  const handleRegister = useCallback(async () => {
    const token = getCognitoToken();
    if (!token) {
      setErrorMessage("Session expired. Please sign in again.");
      setStatus("error");
      return;
    }

    setStatus("loading");
    setErrorMessage(null);

    try {
      const result = await registerGenesisPass(token);
      if (result.success && result.data) {
        setStatus("registered");
        setRegisteredAt(result.data.registeredAt);
        logger.log("[GenesisPass] Registered:", result.data.walletAddress);
      }
    } catch (err) {
      logger.error("[GenesisPass] Registration failed:", err);
      if (err instanceof GenesisPassApiError) {
        if (err.errorCode === "ALREADY_REGISTERED") {
          setStatus("registered");
          return;
        }
        if (err.errorCode === "NO_EVM_WALLET") {
          setErrorMessage("No EVM wallet linked. Please connect a MetaMask wallet first.");
        } else {
          setErrorMessage(err.message);
        }
      } else {
        setErrorMessage("Registration failed. Please try again.");
      }
      setStatus("error");
    }
  }, [getCognitoToken]);

  // Scenario B: useWalletAuth link flow
  const { connect, isAuthenticating, error: walletError } = useWalletAuth({
    mode: "link",
    onSuccess: (_walletAddress) => {
      logger.log("[GenesisPass] Wallet linked, registering...");
      handleRegister();
    },
    onError: (err) => {
      logger.error("[GenesisPass] Wallet link failed:", err);
      setErrorMessage(err.message);
      setStatus("error");
    },
  });

  const handleConnectAndRegister = useCallback(async () => {
    setErrorMessage(null);
    setStatus("loading");
    await connect();
  }, [connect]);

  const handleMetaMaskDeeplink = useCallback(() => {
    const { host, pathname } = window.location;
    window.open(`https://metamask.app.link/dapp/${host}${pathname}`, "_self");
  }, []);

  const handleCopyLink = useCallback(() => {
    navigator.clipboard.writeText(window.location.href);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  }, []);

  const isLoading = status === "loading" || status === "checking" || isAuthenticating;

  return (
    <PageLayout>
      <SectionLayout maxWidth="5xl" titleAlign="center">
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-8">
          <div className="text-center">
            <h1 className="text-3xl md:text-4xl font-bold text-nasun-white mb-3">
              Genesis Pass Allowlist
            </h1>
            <p className="text-nasun-white/60 text-sm md:text-base max-w-md mx-auto">
              Register your EVM wallet address for the Genesis Pass NFT allowlist.
            </p>
          </div>

          {/* Linked wallet display */}
          {hasLinkedMetaMask && linkedWalletAddress && (
            <div className="text-center">
              <p className="text-nasun-white/50 text-xs mb-1">Linked EVM Wallet</p>
              <p className="text-nasun-white font-mono text-sm">
                {truncateAddress(linkedWalletAddress)}
              </p>
            </div>
          )}

          {/* Registration status */}
          {status === "registered" && (
            <div className="text-center bg-green-500/10 border border-green-500/30 rounded-lg px-6 py-4">
              <p className="text-green-400 font-medium">Successfully registered!</p>
              {registeredAt && (
                <p className="text-nasun-white/50 text-xs mt-1">
                  Registered at: {new Date(registeredAt).toLocaleString("en-US")}
                </p>
              )}
            </div>
          )}

          {/* Error display */}
          {(errorMessage || walletError) && status === "error" && (
            <div className="text-center bg-red-500/10 border border-red-500/30 rounded-lg px-6 py-4 max-w-md">
              <p className="text-red-400 text-sm">{errorMessage || walletError}</p>
            </div>
          )}

          {/* Main action area */}
          <div className="flex flex-col items-center gap-4 w-full max-w-sm">
            {/* Scenario A: MetaMask linked, register directly */}
            {hasLinkedMetaMask && status !== "registered" && (
              <ButtonV3
                variant="nw2"
                size="lg"
                className="w-full"
                onClick={handleRegister}
                disabled={isLoading}
              >
                {isLoading ? "Registering..." : "Register for Allowlist"}
              </ButtonV3>
            )}

            {/* Scenario B: No MetaMask, safe environment */}
            {needsWalletConnect && !isMobileBlocked && status !== "registered" && (
              <>
                <ButtonV3
                  variant="nw2"
                  size="lg"
                  className="w-full"
                  onClick={handleConnectAndRegister}
                  disabled={isLoading}
                >
                  {isLoading ? "Connecting..." : "Connect Wallet & Register"}
                </ButtonV3>

                {/* WC signing hint for mobile */}
                {isMobileBrowser() && isAuthenticating && (
                  <p className="text-yellow-300 text-xs text-center">
                    Open your wallet app to approve the signature request.
                  </p>
                )}

                {/* Mobile general hint */}
                {isMobileBrowser() && !isMetaMaskInAppBrowser() && !isAuthenticating && (
                  <p className="text-nasun-white/40 text-xs text-center">
                    On mobile, you'll approve twice: once to connect, once to sign.
                    If you experience issues, try again on desktop.
                  </p>
                )}
              </>
            )}

            {/* Scenario B: Mobile blocked environment */}
            {isMobileBlocked && status !== "registered" && (
              <>
                <ButtonV3
                  variant="nw2"
                  size="lg"
                  className="w-full"
                  disabled
                >
                  Connect Wallet & Register
                </ButtonV3>

                <div className="bg-black/30 border border-nasun-white/10 rounded-lg px-4 py-3 w-full">
                  <p className="text-sm mb-3 text-center">
                    <span className="text-yellow-300">For mobile users:</span>
                    {isAndroidBrowser()
                      ? " for a smoother wallet connection, we recommend starting the process in MetaMask's built-in browser."
                      : " for a smoother wallet connection, we recommend using MetaMask's built-in browser or Safari."}
                  </p>
                  <div className="flex flex-col gap-3 items-center">
                    <ButtonV3
                      variant="nw5"
                      outline
                      size="sm"
                      onClick={handleMetaMaskDeeplink}
                    >
                      Open in MetaMask
                    </ButtonV3>
                    {!isAndroidBrowser() && (
                      <ButtonV3
                        variant="nw5"
                        outline
                        size="sm"
                        onClick={handleCopyLink}
                      >
                        {linkCopied ? "Copied! Paste in Safari" : "Copy Link for Safari"}
                      </ButtonV3>
                    )}
                  </div>
                  <p className="text-xs text-nasun-white/50 mt-3 text-center">
                    If you experience issues with wallet connection, please try again on desktop.
                  </p>
                </div>
              </>
            )}

            {/* Already registered */}
            {status === "registered" && (
              <ButtonV3
                variant="nw2"
                size="lg"
                className="w-full"
                disabled
              >
                Already Registered
              </ButtonV3>
            )}
          </div>
        </div>
      </SectionLayout>
    </PageLayout>
  );
};

export default DevGenesisPassPage;
