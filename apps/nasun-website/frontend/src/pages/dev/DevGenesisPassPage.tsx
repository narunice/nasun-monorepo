/**
 * Genesis Pass Allowlist Registration Page
 *
 * /dev/genesis-pass (public page, auth checked before modal)
 *
 * Modal-based flow with useReducer state machine:
 * - checking: verify existing registration (identity-based)
 * - confirm: linked wallet found, confirm or change
 * - connect: no wallet linked, mobile-aware connect flow
 * - wallet-linking: wallet connection + signature in progress
 * - submitting: API registration call
 * - success: registered
 * - error: recoverable error
 */

import { useReducer, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
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
  getMyGenesisPassStatus,
  GenesisPassApiError,
} from "@/services/genesisPassApi";
import logger from "@/lib/logger";
import { cn } from "@/utils/utils";

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

type ModalState =
  | { step: "idle" }
  | { step: "checking" }
  | { step: "confirm"; walletAddress: string; conflicted: boolean }
  | { step: "connect" }
  | { step: "wallet-linking" }
  | { step: "submitting" }
  | { step: "success"; walletAddress: string; registeredAt: string; replaced: boolean }
  | { step: "error"; message: string };

type ModalAction =
  | { type: "OPEN" }
  | { type: "CHECKED_REGISTERED"; walletAddress: string; registeredAt: string }
  | { type: "CHECKED_NOT_REGISTERED"; walletAddress: string; conflicted: boolean }
  | { type: "CHECKED_NO_WALLET" }
  | { type: "START_CONNECT" }
  | { type: "WALLET_LINKING" }
  | { type: "SUBMITTING" }
  | { type: "REGISTERED"; walletAddress: string; registeredAt: string; replaced: boolean }
  | { type: "ERROR"; message: string }
  | { type: "RETRY" }
  | { type: "CLOSE" };

function modalReducer(_state: ModalState, action: ModalAction): ModalState {
  switch (action.type) {
    case "OPEN":
      return { step: "checking" };
    case "CHECKED_REGISTERED":
      return { step: "success", walletAddress: action.walletAddress, registeredAt: action.registeredAt, replaced: false };
    case "CHECKED_NOT_REGISTERED":
      return { step: "confirm", walletAddress: action.walletAddress, conflicted: action.conflicted };
    case "CHECKED_NO_WALLET":
      return { step: "connect" };
    case "START_CONNECT":
      return { step: "connect" };
    case "WALLET_LINKING":
      return { step: "wallet-linking" };
    case "SUBMITTING":
      return { step: "submitting" };
    case "REGISTERED":
      return { step: "success", walletAddress: action.walletAddress, registeredAt: action.registeredAt, replaced: action.replaced };
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
}

function GenesisPassModal({ state, dispatch }: GenesisPassModalProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  // wallet-linking uses a page-level overlay instead of Dialog (focus-trap conflict with RainbowKit)
  const isOpen = state.step !== "idle" && state.step !== "wallet-linking";

  const linkedWalletAddress =
    user?.linkedAccounts?.metamask?.walletAddress ||
    (user?.provider === "MetaMask" ? user.walletAddress : undefined);

  // Prevent closing during async operations
  const isBlocking = state.step === "submitting";

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open && !isBlocking) {
        dispatch({ type: "CLOSE" });
      }
    },
    [isBlocking, dispatch],
  );

  // Get cognitoToken with fallback
  const getCognitoToken = useCallback((): string | null => {
    return user?.cognitoToken ?? useBattalionNftStore.getState().cognitoToken ?? null;
  }, [user?.cognitoToken]);

  // Check registration status when modal opens (identity-based, single call)
  useEffect(() => {
    if (state.step !== "checking") return;

    let cancelled = false;

    const check = async () => {
      const token = getCognitoToken();
      if (token) {
        try {
          const result = await getMyGenesisPassStatus(token);
          if (cancelled) return;

          if (result.data.registered) {
            dispatch({
              type: "CHECKED_REGISTERED",
              walletAddress: result.data.walletAddress || linkedWalletAddress || "unknown",
              registeredAt: result.data.registeredAt || new Date().toISOString(),
            });
          } else if (linkedWalletAddress) {
            dispatch({
              type: "CHECKED_NOT_REGISTERED",
              walletAddress: linkedWalletAddress,
              conflicted: result.data.walletConflict === true,
            });
          } else {
            dispatch({ type: "CHECKED_NO_WALLET" });
          }
        } catch (err) {
          if (cancelled) return;
          logger.warn("[GenesisPass] Status check failed:", err);
          // Fallback: show confirm if wallet is linked, otherwise connect
          if (linkedWalletAddress) {
            dispatch({ type: "CHECKED_NOT_REGISTERED", walletAddress: linkedWalletAddress, conflicted: false });
          } else {
            dispatch({ type: "CHECKED_NO_WALLET" });
          }
        }
      } else if (linkedWalletAddress) {
        dispatch({ type: "CHECKED_NOT_REGISTERED", walletAddress: linkedWalletAddress, conflicted: false });
      } else {
        dispatch({ type: "CHECKED_NO_WALLET" });
      }
    };

    check();
    return () => { cancelled = true; };
  }, [state.step, linkedWalletAddress, getCognitoToken, dispatch]);

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
          replaced: result.data.replaced === true,
        });
        logger.log("[GenesisPass] Registered:", result.data.walletAddress, result.data.replaced ? "(takeover)" : "");
      } else {
        dispatch({ type: "ERROR", message: result.message || "Registration failed." });
      }
    } catch (err) {
      logger.error("[GenesisPass] Registration failed:", err);
      if (err instanceof GenesisPassApiError) {
        if (err.errorCode === "ALREADY_REGISTERED") {
          dispatch({
            type: "REGISTERED",
            walletAddress: linkedWalletAddress || "unknown",
            registeredAt: new Date().toISOString(),
            replaced: false,
          });
          return;
        }
        // Show confirm step with conflict warning so user can choose to proceed
        if (err.errorCode === "ADDRESS_ALREADY_REGISTERED" && linkedWalletAddress) {
          dispatch({ type: "CHECKED_NOT_REGISTERED", walletAddress: linkedWalletAddress, conflicted: true });
          return;
        }
        dispatch({ type: "ERROR", message: err.message });
      } else {
        dispatch({ type: "ERROR", message: "Registration failed. Please try again." });
      }
    }
  }, [getCognitoToken, linkedWalletAddress, dispatch]);

  // Wallet link flow (Scenario B: no MetaMask linked)
  // Dialog must close before RainbowKit opens to avoid Radix focus-trap conflict.
  // WALLET_LINKING state shows a page-level overlay instead of a dialog.
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
    // Close dialog to avoid focus-trap blocking RainbowKit modal
    dispatch({ type: "WALLET_LINKING" });
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
            {state.conflicted && (
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-sm px-4 py-3 w-full">
                <p className="text-yellow-400 text-sm">
                  This wallet is currently registered by another account.
                  Proceeding will transfer the allowlist registration to your account.
                </p>
              </div>
            )}
            <div className="flex flex-col gap-3 w-full">
              <ButtonV3
                variant="nw2"
                size="lg"
                className="w-full"
                onClick={handleSubmit}
              >
                {state.conflicted ? "Register anyway" : "Submit this address"}
              </ButtonV3>
              {!isMobileBrowser() && (
                <ButtonV3
                  variant="nw2"
                  outline
                  size="lg"
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
                  variant="nw2"
                  outline
                  size="lg"
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

      case "wallet-linking":
        // Rendered as page-level overlay, not inside Dialog
        return null;

      case "submitting":
        return (
          <div className="flex flex-col items-center py-8">
            <InlineLoading message="Registering..." size="md" />
          </div>
        );

      case "success":
        return (
          <div className="flex flex-col items-center gap-6 py-4">
            <div className="text-center bg-green-500/10 border border-green-500/30 rounded-sm px-6 py-4 w-full">
              <p className="text-green-400 font-medium mb-2">Successfully registered!</p>
              <p className="text-nasun-white font-mono text-sm">{truncateAddress(state.walletAddress)}</p>
              <p className="text-nasun-white/50 text-xs mt-1">
                Registered at: {new Date(state.registeredAt).toLocaleString("en-US")}
              </p>
              {state.replaced && (
                <p className="text-yellow-400/80 text-xs mt-2">
                  This wallet was previously registered by another account. The registration has been transferred to yours.
                </p>
              )}
            </div>
            <div className="flex flex-col gap-3 w-full">
              <ButtonV3
                variant="nw2"
                size="lg"
                className="w-full"
                onClick={() => { dispatch({ type: "CLOSE" }); navigate("/my-account"); }}
              >
                Go to My Account
              </ButtonV3>
              <ButtonV3
                variant="nw2"
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

      case "error":
        return (
          <div className="flex flex-col items-center gap-6 py-4">
            <div className="text-center bg-red-500/10 border border-red-500/30 rounded-sm px-6 py-4 w-full">
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
        className={cn("bg-gray-900 border-nasun-c5/30", state.step === "success" && "[&>button]:hidden")}
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
    if (isAuthenticated) {
      dispatch({ type: "OPEN" });
    } else {
      // Skip intermediary modal, go straight to login
      pendingLoginRef.current = true;
      window.dispatchEvent(new CustomEvent("nasun:open-login"));
    }
  }, [isAuthenticated]);

  // Auto-open registration modal after login completes
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

      <GenesisPassModal state={state} dispatch={dispatch} />

      {/* Page-level overlay during wallet linking (Dialog is closed to avoid focus-trap conflict with RainbowKit) */}
      {state.step === "wallet-linking" && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-nasun-black/60 backdrop-blur-sm pointer-events-none">
          <div className="flex flex-col items-center gap-3">
            <InlineLoading message="Linking wallet and registering..." size="md" />
            <p className="text-nasun-white/40 text-xs">
              Please complete the signature request in your wallet.
            </p>
          </div>
        </div>
      )}
    </PageLayout>
  );
};

export default DevGenesisPassPage;
