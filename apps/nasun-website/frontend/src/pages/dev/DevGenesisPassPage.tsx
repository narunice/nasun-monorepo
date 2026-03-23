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

import { useReducer, useEffect, useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageLayout } from "@/components/layout/PageLayout";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { SectionTitle } from "@/components/ui/SectionTitle";
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
  isMetaMaskInAppBrowser,
  isIOSSafari,
} from "@/utils/mobileDetect";
import {
  registerGenesisPass,
  getMyGenesisPassStatus,
  GenesisPassApiError,
} from "@/services/genesisPassApi";
import { refreshAndSaveUserProfile } from "@/features/auth/services/userProfileService";
import logger from "@/lib/logger";
import { cn } from "@/utils/utils";

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

type ModalState =
  | { step: "idle" }
  | { step: "login-required" }
  | { step: "checking" }
  | {
      step: "confirm";
      walletAddress: string;
      conflicted: boolean;
      justConnected: boolean;
    }
  | { step: "connect" }
  | { step: "wallet-linking" }
  | { step: "submitting" }
  | {
      step: "success";
      walletAddress: string;
      registeredAt: string;
      replaced: boolean;
      status: string;
    }
  | { step: "error"; message: string };

type ModalAction =
  | { type: "OPEN" }
  | { type: "OPEN_UNAUTHENTICATED" }
  | { type: "CHECKED_REGISTERED"; walletAddress: string; registeredAt: string; status: string }
  | {
      type: "CHECKED_NOT_REGISTERED";
      walletAddress: string;
      conflicted: boolean;
    }
  | { type: "CHECKED_NO_WALLET" }
  | { type: "START_CONNECT" }
  | { type: "WALLET_LINKING" }
  | { type: "WALLET_LINKED"; walletAddress: string }
  | { type: "SUBMITTING" }
  | {
      type: "REGISTERED";
      walletAddress: string;
      registeredAt: string;
      replaced: boolean;
      status: string;
    }
  | { type: "ERROR"; message: string }
  | { type: "RETRY" }
  | { type: "CLOSE" };

function modalReducer(_state: ModalState, action: ModalAction): ModalState {
  switch (action.type) {
    case "OPEN":
      return { step: "checking" };
    case "OPEN_UNAUTHENTICATED":
      return { step: "login-required" };
    case "CHECKED_REGISTERED":
      return {
        step: "success",
        walletAddress: action.walletAddress,
        registeredAt: action.registeredAt,
        replaced: false,
        status: action.status,
      };
    case "CHECKED_NOT_REGISTERED":
      return {
        step: "confirm",
        walletAddress: action.walletAddress,
        conflicted: action.conflicted,
        justConnected: false,
      };
    case "CHECKED_NO_WALLET":
      return { step: "connect" };
    case "START_CONNECT":
      return { step: "connect" };
    case "WALLET_LINKING":
      return { step: "wallet-linking" };
    case "WALLET_LINKED":
      return {
        step: "confirm",
        walletAddress: action.walletAddress,
        conflicted: false,
        justConnected: true,
      };
    case "SUBMITTING":
      return { step: "submitting" };
    case "REGISTERED":
      return {
        step: "success",
        walletAddress: action.walletAddress,
        registeredAt: action.registeredAt,
        replaced: action.replaced,
        status: action.status,
      };
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
    return (
      user?.cognitoToken ?? useBattalionNftStore.getState().cognitoToken ?? null
    );
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

          if (result.data.registered || result.data.applied) {
            dispatch({
              type: "CHECKED_REGISTERED",
              walletAddress:
                result.data.walletAddress || linkedWalletAddress || "unknown",
              registeredAt:
                result.data.registeredAt || new Date().toISOString(),
              status: result.data.status || "ACTIVE",
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
            dispatch({
              type: "CHECKED_NOT_REGISTERED",
              walletAddress: linkedWalletAddress,
              conflicted: false,
            });
          } else {
            dispatch({ type: "CHECKED_NO_WALLET" });
          }
        }
      } else if (linkedWalletAddress) {
        dispatch({
          type: "CHECKED_NOT_REGISTERED",
          walletAddress: linkedWalletAddress,
          conflicted: false,
        });
      } else {
        dispatch({ type: "CHECKED_NO_WALLET" });
      }
    };

    check();
    return () => {
      cancelled = true;
    };
  }, [state.step, linkedWalletAddress, getCognitoToken, dispatch]);

  // Register API call
  const handleSubmit = useCallback(async () => {
    const token = getCognitoToken();
    if (!token) {
      dispatch({
        type: "ERROR",
        message: "Session expired. Please sign in again.",
      });
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
          status: "APPLIED",
        });
        logger.log(
          "[GenesisPass] Registered:",
          result.data.walletAddress,
          result.data.replaced ? "(takeover)" : "",
        );
      } else {
        dispatch({
          type: "ERROR",
          message: result.message || "Registration failed.",
        });
      }
    } catch (err) {
      logger.error("[GenesisPass] Registration failed:", err);
      if (err instanceof GenesisPassApiError) {
        if (err.errorCode === "ALREADY_REGISTERED" || err.errorCode === "ALREADY_APPLIED") {
          dispatch({
            type: "REGISTERED",
            walletAddress: linkedWalletAddress || "unknown",
            registeredAt: new Date().toISOString(),
            replaced: false,
            status: err.errorCode === "ALREADY_REGISTERED" ? "ACTIVE" : "APPLIED",
          });
          return;
        }
        // Show confirm step with conflict warning so user can choose to proceed
        if (
          err.errorCode === "ADDRESS_ALREADY_REGISTERED" &&
          linkedWalletAddress
        ) {
          dispatch({
            type: "CHECKED_NOT_REGISTERED",
            walletAddress: linkedWalletAddress,
            conflicted: true,
          });
          return;
        }
        dispatch({ type: "ERROR", message: err.message });
      } else {
        dispatch({
          type: "ERROR",
          message: "Registration failed. Please try again.",
        });
      }
    }
  }, [getCognitoToken, linkedWalletAddress, dispatch]);

  // Wallet link flow (Scenario B: no MetaMask linked)
  // Dialog must close before RainbowKit opens to avoid Radix focus-trap conflict.
  // WALLET_LINKING state shows a page-level overlay instead of a dialog.
  const { connect } = useWalletAuth({
    mode: "link",
    onSuccess: (walletAddress) => {
      logger.log("[GenesisPass] Wallet linked:", walletAddress);
      dispatch({ type: "WALLET_LINKED", walletAddress });
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

  // Manual EVM address entry (mobile fallback)
  const [manualAddress, setManualAddress] = useState("");
  const [isSubmittingManual, setIsSubmittingManual] = useState(false);
  const [manualError, setManualError] = useState("");
  const isValidEvmAddress = (addr: string) => /^0x[a-fA-F0-9]{40}$/.test(addr);

  useEffect(() => {
    if (state.step === "connect") { setManualAddress(""); setManualError(""); }
  }, [state.step]);

  const handleManualSubmit = useCallback(async () => {
    const token = getCognitoToken();
    const linkAccountApi = import.meta.env.VITE_LINK_ACCOUNT_API;
    if (!token || !user?.identityId) {
      dispatch({ type: "ERROR", message: "Session expired. Please sign in again." });
      return;
    }
    if (!linkAccountApi) {
      dispatch({ type: "ERROR", message: "Service unavailable." });
      return;
    }
    const trimmed = manualAddress.trim();
    setIsSubmittingManual(true);
    setManualError("");
    try {
      const res = await fetch(`${linkAccountApi}/register-evm`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ primaryIdentityId: user.identityId, evmAddress: trimmed }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 409) {
          setManualError("EVM wallet already linked. Unlink first on My Account page.");
        } else if (res.status === 401) {
          dispatch({ type: "ERROR", message: "Session expired. Please sign in again." });
        } else {
          setManualError(data.message || "Failed to connect address.");
        }
        return;
      }
      await refreshAndSaveUserProfile(user.identityId);
      dispatch({ type: "WALLET_LINKED", walletAddress: trimmed });
    } catch {
      dispatch({ type: "ERROR", message: "Failed to connect address. Please try again." });
    } finally {
      setIsSubmittingManual(false);
    }
  }, [manualAddress, getCognitoToken, user?.identityId, dispatch]);

  // Render modal content based on current step
  const renderContent = () => {
    switch (state.step) {
      case "idle":
        return null;

      case "login-required":
        return (
          <div className="flex flex-col items-center gap-6 py-4">
            <p className="text-nasun-white/60 text-base text-center">
              To apply for the allowlist, you need to log in to the website.
            </p>
            <div className="flex flex-col gap-3 w-full">
              <ButtonV3
                variant="nw2"
                size="lg"
                className="w-full"
                onClick={() => {
                  sessionStorage.setItem("nasun:genesis-pass:pending", "true");
                  dispatch({ type: "CLOSE" });
                  window.dispatchEvent(new CustomEvent("nasun:open-login"));
                }}
              >
                Log In / Sign Up
              </ButtonV3>
              <ButtonV3
                variant="nw2"
                outline
                size="lg"
                className="w-full"
                onClick={() => dispatch({ type: "CLOSE" })}
              >
                Cancel
              </ButtonV3>
            </div>
          </div>
        );

      case "checking":
        return (
          <div className="flex flex-col items-center py-8">
            <InlineLoading
              message="Checking registration status..."
              size="md"
            />
          </div>
        );

      case "confirm":
        return (
          <div className="flex flex-col items-center gap-6 pt-4 pb-1">
            <div className="text-center">
              <p className="text-nasun-white font-mono text-lg mb-2">
                {truncateAddress(state.walletAddress)}
              </p>
              <p className="text-nasun-white/60 text-base">
                Apply with this address?
              </p>
            </div>
            {state.conflicted && (
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-sm px-4 py-3 w-full">
                <p className="text-yellow-400 text-sm">
                  This wallet is currently registered by another account.
                  Proceeding will transfer the allowlist registration to your
                  account.
                </p>
              </div>
            )}
            <div className="flex flex-col gap-3 w-full">
              <div className="flex gap-3 w-full">
                <ButtonV3
                  variant="nw2"
                  outline
                  size="lg"
                  className="flex-1"
                  onClick={() => dispatch({ type: "CLOSE" })}
                >
                  Cancel
                </ButtonV3>
                <ButtonV3
                  variant="nw2"
                  size="lg"
                  className="flex-1"
                  onClick={handleSubmit}
                >
                  {state.conflicted ? "Apply anyway" : "Submit"}
                </ButtonV3>
              </div>
            </div>
            {!state.justConnected && !isMobileBrowser() && (
              <button
                type="button"
                className="self-start text-nasun-white/40 hover:text-nasun-white/70 text-sm underline transition-colors"
                onClick={handleConnectWallet}
              >
                Use a different address
              </button>
            )}
          </div>
        );

      case "connect":
        return (
          <div className="flex flex-col items-center gap-6 py-4">
            <p className="text-nasun-white/60 text-base text-center">
              To apply for the allowlist, you need to put in your EVM address
              first.
            </p>

            {/* Desktop, MetaMask In-App, or iOS Safari: direct connect */}
            {(!isMobileBrowser() ||
              isMetaMaskInAppBrowser() ||
              isIOSSafari()) && (
              <ButtonV3
                variant="nw2"
                size="lg"
                className="w-full"
                onClick={handleConnectWallet}
              >
                Connect Wallet
              </ButtonV3>
            )}

            {/* Mobile (except iOS Safari and MetaMask in-app): manual address entry */}
            {isMobileBrowser() &&
              !isIOSSafari() &&
              !isMetaMaskInAppBrowser() && (
                <div className="flex flex-col gap-3 w-full">
                  <input
                    type="text"
                    placeholder="0x..."
                    maxLength={42}
                    value={manualAddress}
                    onChange={(e) => { setManualAddress(e.target.value); setManualError(""); }}
                    className="w-full px-4 py-3 bg-gray-800 border border-nasun-white/20 rounded-sm text-nasun-white font-mono text-sm placeholder:text-nasun-white/30 focus:border-nasun-nw2 focus:outline-none disabled:opacity-50"
                    disabled={isSubmittingManual}
                  />
                  {manualAddress && !isValidEvmAddress(manualAddress) && (
                    <p className="text-red-400 text-xs">Invalid EVM address format (0x + 40 hex characters)</p>
                  )}
                  {manualError && <p className="text-red-400 text-xs">{manualError}</p>}
                  <ButtonV3
                    variant="nw2"
                    size="lg"
                    className="w-full"
                    onClick={handleManualSubmit}
                    disabled={!isValidEvmAddress(manualAddress) || isSubmittingManual}
                  >
                    {isSubmittingManual ? "Linking..." : "Link Address"}
                  </ButtonV3>
                </div>
              )}
          </div>
        );

      case "wallet-linking":
        // Rendered as page-level overlay, not inside Dialog
        return null;

      case "submitting":
        return (
          <div className="flex flex-col items-center py-8">
            <InlineLoading message="Submitting..." size="md" />
          </div>
        );

      case "success": {
        const isActive = state.status === "ACTIVE";
        const boxColor = isActive
          ? "bg-green-500/10 border-green-500/30"
          : "bg-yellow-500/10 border-yellow-500/30";
        const textColor = isActive ? "text-green-400" : "text-yellow-400";
        const heading = isActive ? "Registered!" : "Application submitted!";
        const subtitle = isActive
          ? "You are on the allowlist."
          : "Your allowlist status will be updated on the My Account page.";

        return (
          <div className="flex flex-col items-center gap-6 py-4">
            <div className={cn("text-center rounded-sm px-6 py-4 w-full border", boxColor)}>
              <p className={cn("font-medium mb-2", textColor)}>
                {heading}
              </p>
              <p className="text-nasun-white font-mono text-sm">
                {truncateAddress(state.walletAddress)}
              </p>
              {state.replaced && (
                <p className="text-yellow-400/80 text-xs mt-2">
                  This wallet was previously registered by another account. The
                  registration has been transferred to yours.
                </p>
              )}
            </div>
            <p className="text-nasun-white/60 text-sm text-center">
              {subtitle}
            </p>
            <div className="flex flex-col-reverse sm:flex-row gap-6 sm:gap-3 w-full">
              <ButtonV3
                variant="nw2"
                outline
                size="lg"
                className="flex-1"
                onClick={() => dispatch({ type: "CLOSE" })}
              >
                Close
              </ButtonV3>
              <ButtonV3
                variant="nw2"
                size="lg"
                className="flex-1"
                onClick={() => {
                  dispatch({ type: "CLOSE" });
                  navigate("/my-account");
                }}
              >
                Go to My Account
              </ButtonV3>
            </div>
          </div>
        );
      }

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
        className={cn(
          "bg-gray-900 border-nasun-c5/30",
          state.step === "success" && "[&>button]:hidden",
        )}
        onInteractOutside={(e) => {
          if (isBlocking) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (isBlocking) e.preventDefault();
        }}
      >
        {(state.step === "checking" || state.step === "submitting" || state.step === "error") && (
          <DialogHeader>
            <DialogTitle className="text-nasun-white">
              Genesis Pass Allowlist
            </DialogTitle>
            <DialogDescription className="text-nasun-white/60">
              Apply for the Genesis Pass NFT allowlist with your EVM wallet.
            </DialogDescription>
          </DialogHeader>
        )}
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
  const handleOpen = useCallback(() => {
    sessionStorage.removeItem("nasun:genesis-pass:pending");
    if (isAuthenticated) {
      dispatch({ type: "OPEN" });
    } else {
      dispatch({ type: "OPEN_UNAUTHENTICATED" });
    }
  }, [isAuthenticated]);

  // Auto-open registration modal after login completes
  useEffect(() => {
    if (isAuthenticated && sessionStorage.getItem("nasun:genesis-pass:pending")) {
      sessionStorage.removeItem("nasun:genesis-pass:pending");
      dispatch({ type: "OPEN" });
    }
  }, [isAuthenticated]);

  return (
    <PageLayout>
      {/* Hero Section */}
      <div className="relative h-screen overflow-hidden bg-nasun-black">
        {/* Video placeholder */}
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-gray-900 via-nasun-black to-nasun-black">
          <div className="absolute inset-0 opacity-20">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-nasun-c5/30 via-transparent to-transparent" />
          </div>
          <svg
            className="w-16 h-16 text-nasun-white/20"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z"
            />
          </svg>
        </div>

        {/* Gradient overlay */}
        <div
          className="absolute inset-0 -mb-[2px] pointer-events-none z-10"
          style={{
            background:
              "linear-gradient(to bottom, transparent 50%, rgb(25, 22, 21) 95%)",
          }}
        />

        {/* Title overlay */}
        <div className="absolute inset-0 z-20 flex items-center justify-center">
          <SectionTitle
            as="h1"
            color="white"
            className="uppercase text-center !text-5xl md:!text-7xl tracking-wider"
          >
            Genesis Pass
          </SectionTitle>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-6 inset-x-0 z-30 flex justify-center">
          <svg
            className="w-5 h-5 md:w-6 md:h-6 text-nasun-white/50 animate-bounce"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 8.25l-7.5 7.5-7.5-7.5"
            />
          </svg>
        </div>
      </div>

      {/* Description + CTA Section */}
      <SectionLayout maxWidth="5xl" titleAlign="center">
        <div className="flex flex-col items-center gap-10 py-16 md:py-24">
          <div className="text-center max-w-xl">
            <p className="text-nasun-white/70 text-base md:text-lg leading-relaxed">
              Genesis Pass is a proof of membership for those who have been with
              Nasun from Day 1. By applying for the allowlist, you secure
              your place as a founding community member and gain priority access
              to the Genesis Pass NFT mint.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
            <ButtonV3
              variant="nw2"
              size="lg"
              className="sm:min-w-[200px]"
              onClick={handleOpen}
            >
              Apply for Allowlist
            </ButtonV3>
            {/* TODO: Uncomment when OpenSea collection page is ready
            <ButtonV3
              variant="nw2"
              outline
              size="lg"
              className="sm:min-w-[200px]"
              onClick={() =>
                window.open(
                  "https://opensea.io",
                  "_blank",
                  "noopener,noreferrer",
                )
              }
            >
              View on OpenSea
            </ButtonV3>
            */}
          </div>
        </div>
      </SectionLayout>

      <GenesisPassModal state={state} dispatch={dispatch} />

      {/* Page-level overlay during wallet linking (Dialog is closed to avoid focus-trap conflict with RainbowKit) */}
      {state.step === "wallet-linking" && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-nasun-black/60 backdrop-blur-sm pointer-events-none">
          <div className="flex flex-col items-center gap-3">
            <InlineLoading message="Connecting wallet..." size="md" />
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
