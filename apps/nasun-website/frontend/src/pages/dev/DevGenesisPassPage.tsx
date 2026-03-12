/**
 * Genesis Pass Allowlist Registration Page
 *
 * /dev/genesis-pass (public page, auth checked in modal)
 *
 * Modal-based flow with useReducer state machine:
 * - checking: verify existing registration
 * - confirm: linked wallet found, confirm or change
 * - connect: no wallet linked, mobile-aware connect flow
 * - connecting: wallet connection in progress
 * - submitting: API registration call
 * - success: registered
 * - error: recoverable error
 */

import { useReducer, useEffect, useCallback, useRef } from "react";
import { PageLayout } from "@/components/layout/PageLayout";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { ButtonV3 } from "@/components/ui/button-v3";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { InlineLoading } from "@/components/ui/InlineLoading";
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

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

type ModalState =
  | { step: "idle" }
  | { step: "not_authenticated" }
  | { step: "checking" }
  | { step: "confirm"; walletAddress: string }
  | { step: "connect" }
  | { step: "connecting" }
  | { step: "submitting" }
  | { step: "success"; walletAddress: string; registeredAt: string }
  | { step: "error"; message: string };

type ModalAction =
  | { type: "OPEN" }
  | { type: "OPEN_NOT_AUTHENTICATED" }
  | { type: "CHECKED_REGISTERED"; walletAddress: string; registeredAt: string }
  | { type: "CHECKED_NOT_REGISTERED"; walletAddress: string }
  | { type: "CHECKED_NO_WALLET" }
  | { type: "START_CONNECT" }
  | { type: "CONNECTING" }
  | { type: "SUBMITTING" }
  | { type: "REGISTERED"; walletAddress: string; registeredAt: string }
  | { type: "ERROR"; message: string }
  | { type: "RETRY" }
  | { type: "CLOSE" };

function modalReducer(_state: ModalState, action: ModalAction): ModalState {
  switch (action.type) {
    case "OPEN":
      return { step: "checking" };
    case "OPEN_NOT_AUTHENTICATED":
      return { step: "not_authenticated" };
    case "CHECKED_REGISTERED":
      return { step: "success", walletAddress: action.walletAddress, registeredAt: action.registeredAt };
    case "CHECKED_NOT_REGISTERED":
      return { step: "confirm", walletAddress: action.walletAddress };
    case "CHECKED_NO_WALLET":
      return { step: "connect" };
    case "START_CONNECT":
      return { step: "connect" };
    case "CONNECTING":
      return { step: "connecting" };
    case "SUBMITTING":
      return { step: "submitting" };
    case "REGISTERED":
      return { step: "success", walletAddress: action.walletAddress, registeredAt: action.registeredAt };
    case "ERROR":
      return { step: "error", message: action.message };
    case "RETRY":
      return { step: "checking" };
    case "CLOSE":
      return { step: "idle" };
    default:
      return _state;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// ---------------------------------------------------------------------------
// Registration Modal
// ---------------------------------------------------------------------------

interface GenesisPassModalProps {
  state: ModalState;
  dispatch: React.Dispatch<ModalAction>;
  onSignIn: () => void;
}

function GenesisPassModal({ state, dispatch, onSignIn }: GenesisPassModalProps) {
  const { user } = useAuth();
  const isOpen = state.step !== "idle";

  const linkedWalletAddress =
    user?.linkedAccounts?.metamask?.walletAddress ||
    (user?.provider === "MetaMask" ? user.walletAddress : undefined);

  // Prevent closing during async operations
  const isBlocking = state.step === "connecting" || state.step === "submitting";

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open && !isBlocking) {
        dispatch({ type: "CLOSE" });
      }
    },
    [isBlocking, dispatch],
  );

  // Check registration status when modal opens (checking step)
  useEffect(() => {
    if (state.step !== "checking") return;

    let cancelled = false;

    const check = async () => {
      if (linkedWalletAddress) {
        try {
          const result = await checkGenesisPass(linkedWalletAddress);
          if (cancelled) return;

          if (result.data.registered) {
            dispatch({
              type: "CHECKED_REGISTERED",
              walletAddress: linkedWalletAddress,
              registeredAt: result.data.registeredAt || new Date().toISOString(),
            });
          } else {
            dispatch({ type: "CHECKED_NOT_REGISTERED", walletAddress: linkedWalletAddress });
          }
        } catch (err) {
          if (cancelled) return;
          logger.warn("[GenesisPass] Check failed:", err);
          // Fallback: show confirm with linked address
          dispatch({ type: "CHECKED_NOT_REGISTERED", walletAddress: linkedWalletAddress });
        }
      } else {
        dispatch({ type: "CHECKED_NO_WALLET" });
      }
    };

    check();
    return () => { cancelled = true; };
  }, [state.step, linkedWalletAddress, dispatch]);

  // Get cognitoToken with fallback
  const getCognitoToken = useCallback((): string | null => {
    return user?.cognitoToken ?? useBattalionNftStore.getState().cognitoToken ?? null;
  }, [user?.cognitoToken]);

  // Register API call
  const handleSubmit = useCallback(async () => {
    const token = getCognitoToken();
    if (!token) {
      dispatch({ type: "ERROR", message: "Session expired. Please sign in again." });
      return;
    }

    dispatch({ type: "SUBMITTING" });

    try {
      const result = await registerGenesisPass(token);
      if (result.success && result.data) {
        dispatch({
          type: "REGISTERED",
          walletAddress: result.data.walletAddress,
          registeredAt: result.data.registeredAt,
        });
        logger.log("[GenesisPass] Registered:", result.data.walletAddress);
      } else {
        dispatch({ type: "ERROR", message: result.message || "Registration failed." });
      }
    } catch (err) {
      logger.error("[GenesisPass] Registration failed:", err);
      if (err instanceof GenesisPassApiError) {
        if (err.errorCode === "ALREADY_REGISTERED") {
          // Treat as success
          dispatch({
            type: "REGISTERED",
            walletAddress: linkedWalletAddress || "unknown",
            registeredAt: new Date().toISOString(),
          });
          return;
        }
        dispatch({ type: "ERROR", message: err.message });
      } else {
        dispatch({ type: "ERROR", message: "Registration failed. Please try again." });
      }
    }
  }, [getCognitoToken, linkedWalletAddress, dispatch]);

  // Wallet link flow (Scenario B: no MetaMask linked)
  // Dialog is closed before RainbowKit opens to avoid focus-trap conflict.
  // Callbacks reopen the dialog with the appropriate state.
  const { connect } = useWalletAuth({
    mode: "link",
    onSuccess: (_walletAddress) => {
      logger.log("[GenesisPass] Wallet linked, registering...");
      handleSubmit();
    },
    onError: (err) => {
      logger.error("[GenesisPass] Wallet link failed:", err);
      dispatch({ type: "ERROR", message: err.message });
    },
  });

  const handleConnectWallet = useCallback(async () => {
    // Close dialog first to avoid Radix focus-trap blocking RainbowKit modal
    dispatch({ type: "CLOSE" });
    await connect();
  }, [connect, dispatch]);

  const handleMetaMaskDeeplink = useCallback(() => {
    const { host, pathname } = window.location;
    window.open(`https://metamask.app.link/dapp/${host}${pathname}`, "_self");
  }, []);

  const handleCopyLink = useCallback(() => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      // Brief visual feedback could be added here
    }).catch(() => {
      dispatch({ type: "ERROR", message: "Failed to copy link. Please copy the URL manually." });
    });
  }, [dispatch]);

  // Render modal content based on current step
  const renderContent = () => {
    switch (state.step) {
      case "idle":
        return null;

      case "not_authenticated":
        return (
          <div className="flex flex-col items-center gap-6 py-4">
            <p className="text-nasun-white/60 text-sm text-center">
              Please sign in first to register for the Genesis Pass allowlist.
            </p>
            <div className="flex flex-col gap-3 w-full">
              <ButtonV3
                variant="nw2"
                size="lg"
                className="w-full"
                onClick={onSignIn}
              >
                Sign In
              </ButtonV3>
              <ButtonV3
                variant="nw5"
                outline
                size="lg"
                className="w-full"
                onClick={() => dispatch({ type: "CLOSE" })}
              >
                Close
              </ButtonV3>
            </div>
          </div>
        );

      case "checking":
        return (
          <div className="flex flex-col items-center py-8">
            <InlineLoading message="Checking registration status..." size="md" />
          </div>
        );

      case "confirm":
        return (
          <div className="flex flex-col items-center gap-6 py-4">
            <div className="text-center">
              <p className="text-nasun-white/60 text-sm mb-2">You have a linked EVM wallet:</p>
              <p className="text-nasun-white font-mono text-lg">{truncateAddress(state.walletAddress)}</p>
            </div>
            <div className="flex flex-col gap-3 w-full">
              <ButtonV3
                variant="nw2"
                size="lg"
                className="w-full"
                onClick={handleSubmit}
              >
                Submit this address
              </ButtonV3>
              {!isMobileBrowser() && (
                <ButtonV3
                  variant="nw5"
                  outline
                  size="sm"
                  className="w-full"
                  onClick={handleConnectWallet}
                >
                  Use a different wallet
                </ButtonV3>
              )}
            </div>
          </div>
        );

      case "connect":
        return (
          <div className="flex flex-col items-center gap-6 py-4">
            <p className="text-nasun-white/60 text-sm text-center">
              No EVM wallet linked yet. Connect your MetaMask wallet to register.
            </p>

            {/* Desktop, MetaMask In-App, or iOS Safari: direct connect */}
            {(!isMobileBrowser() || isMetaMaskInAppBrowser() || isIOSSafari()) && (
              <ButtonV3
                variant="nw2"
                size="lg"
                className="w-full"
                onClick={handleConnectWallet}
              >
                Connect MetaMask
              </ButtonV3>
            )}

            {/* Android: MetaMask deeplink */}
            {isMobileBrowser() && isAndroidBrowser() && !isMetaMaskInAppBrowser() && (
              <ButtonV3
                variant="nw2"
                size="lg"
                className="w-full"
                onClick={handleMetaMaskDeeplink}
              >
                Open in MetaMask
              </ButtonV3>
            )}

            {/* iOS non-Safari (Chrome, Firefox, etc.): deeplink + copy */}
            {isMobileBrowser() && !isAndroidBrowser() && !isIOSSafari() && !isMetaMaskInAppBrowser() && (
              <div className="flex flex-col gap-3 w-full">
                <ButtonV3
                  variant="nw2"
                  size="lg"
                  className="w-full"
                  onClick={handleMetaMaskDeeplink}
                >
                  Open in MetaMask
                </ButtonV3>
                <ButtonV3
                  variant="nw5"
                  outline
                  size="sm"
                  className="w-full"
                  onClick={handleCopyLink}
                >
                  Copy Link for Safari
                </ButtonV3>
              </div>
            )}

            <p className="text-nasun-white/40 text-xs text-center">
              If you experience issues, please try again on desktop.
            </p>
          </div>
        );

      case "connecting":
        return (
          <div className="flex flex-col items-center gap-4 py-8">
            <InlineLoading
              message={
                isMobileBrowser()
                  ? "Approve the signature in your wallet app."
                  : "Connecting wallet..."
              }
              size="md"
            />
          </div>
        );

      case "submitting":
        return (
          <div className="flex flex-col items-center py-8">
            <InlineLoading message="Registering..." size="md" />
          </div>
        );

      case "success":
        return (
          <div className="flex flex-col items-center gap-6 py-4">
            <div className="text-center bg-green-500/10 border border-green-500/30 rounded-lg px-6 py-4 w-full">
              <p className="text-green-400 font-medium mb-2">Successfully registered!</p>
              <p className="text-nasun-white font-mono text-sm">{truncateAddress(state.walletAddress)}</p>
              <p className="text-nasun-white/50 text-xs mt-1">
                Registered at: {new Date(state.registeredAt).toLocaleString("en-US")}
              </p>
            </div>
            <ButtonV3
              variant="nw5"
              outline
              size="sm"
              className="w-full"
              onClick={() => dispatch({ type: "CLOSE" })}
            >
              Close
            </ButtonV3>
          </div>
        );

      case "error":
        return (
          <div className="flex flex-col items-center gap-6 py-4">
            <div className="text-center bg-red-500/10 border border-red-500/30 rounded-lg px-6 py-4 w-full">
              <p className="text-red-400 text-sm">{state.message}</p>
            </div>
            <ButtonV3
              variant="nw2"
              size="lg"
              className="w-full"
              onClick={() => dispatch({ type: "RETRY" })}
            >
              Try Again
            </ButtonV3>
          </div>
        );
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        onInteractOutside={(e) => { if (isBlocking) e.preventDefault(); }}
        onEscapeKeyDown={(e) => { if (isBlocking) e.preventDefault(); }}
      >
        <DialogHeader>
          <DialogTitle className="text-nasun-white">Genesis Pass Allowlist</DialogTitle>
          <DialogDescription className="text-nasun-white/60">
            Register your EVM wallet for the Genesis Pass NFT allowlist.
          </DialogDescription>
        </DialogHeader>
        {renderContent()}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const DevGenesisPassPage = () => {
  const { isAuthenticated } = useAuth();
  const [state, dispatch] = useReducer(modalReducer, { step: "idle" });
  const pendingLoginRef = useRef(false);

  const handleOpen = useCallback(() => {
    dispatch(isAuthenticated ? { type: "OPEN" } : { type: "OPEN_NOT_AUTHENTICATED" });
  }, [isAuthenticated]);

  const handleSignIn = useCallback(() => {
    pendingLoginRef.current = true;
    dispatch({ type: "CLOSE" });
    window.dispatchEvent(new CustomEvent("nasun:open-login"));
  }, []);

  // Auto-reopen modal after login completes
  useEffect(() => {
    if (isAuthenticated && pendingLoginRef.current) {
      pendingLoginRef.current = false;
      dispatch({ type: "OPEN" });
    }
  }, [isAuthenticated]);

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

          <ButtonV3
            variant="nw2"
            size="lg"
            onClick={handleOpen}
          >
            Register for Allowlist
          </ButtonV3>
        </div>
      </SectionLayout>

      <GenesisPassModal state={state} dispatch={dispatch} onSignIn={handleSignIn} />
    </PageLayout>
  );
};

export default DevGenesisPassPage;
