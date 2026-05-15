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

import { useReducer, useEffect, useCallback, useState, useRef } from "react";
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
  | {
      type: "CHECKED_REGISTERED";
      walletAddress: string;
      registeredAt: string;
      status: string;
    }
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
        if (
          err.errorCode === "ALREADY_REGISTERED" ||
          err.errorCode === "ALREADY_APPLIED"
        ) {
          dispatch({
            type: "REGISTERED",
            walletAddress: linkedWalletAddress || "unknown",
            registeredAt: new Date().toISOString(),
            replaced: false,
            status:
              err.errorCode === "ALREADY_REGISTERED" ? "ACTIVE" : "APPLIED",
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
              <p className="text-nasun-white/50 text-sm mb-2">
                EVM address linked to your account:
              </p>
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

            <ButtonV3
              variant="nw2"
              size="lg"
              className="w-full"
              onClick={handleConnectWallet}
            >
              Link Wallet
            </ButtonV3>
            {isMobileBrowser() &&
              !isIOSSafari() &&
              !isMetaMaskInAppBrowser() && (
                <p className="text-nasun-white/60 text-xs text-center leading-relaxed">
                  If wallet linking does not work on your mobile browser,
                  please retry from a desktop browser or the MetaMask
                  in-app browser. Manual address entry was removed because
                  it cannot verify wallet ownership.
                </p>
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
          : "Thank you for your submission! Allowlist spots will be announced soon.\nYou can check your status anytime on your account page.";

        return (
          <div className="flex flex-col items-center gap-6 py-4">
            <div
              className={cn(
                "text-center rounded-sm px-6 py-4 w-full border",
                boxColor,
              )}
            >
              <p className={cn("font-medium mb-2", textColor)}>{heading}</p>
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
            <p className="text-nasun-white/60 text-sm text-center whitespace-pre-line">
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
        {(state.step === "checking" ||
          state.step === "submitting" ||
          state.step === "error") && (
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
    if (
      isAuthenticated &&
      sessionStorage.getItem("nasun:genesis-pass:pending")
    ) {
      sessionStorage.removeItem("nasun:genesis-pass:pending");
      dispatch({ type: "OPEN" });
    }
  }, [isAuthenticated]);

  // Hero video + title
  const videoRef = useRef<HTMLVideoElement>(null);
  const [skipVideo, setSkipVideo] = useState(false);

  // Apply genesis-drop-theme for black background + footer
  useEffect(() => {
    document.documentElement.classList.add("genesis-drop-theme");
    return () =>
      document.documentElement.classList.remove("genesis-drop-theme");
  }, []);

  // Skip video on slow connections
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const conn = (navigator as any).connection;
    if (
      conn &&
      (conn.saveData ||
        conn.effectiveType === "2g" ||
        conn.effectiveType === "slow-2g")
    ) {
      setSkipVideo(true);
    }
  }, []);

  // Hero subtitles: NASUN, GENESIS, PASS with independent fade timing
  const nasunRef = useRef<HTMLDivElement>(null);
  const genesisRef = useRef<HTMLHeadingElement>(null);
  const passRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const video = videoRef.current;
    const nasun = nasunRef.current;
    const genesis = genesisRef.current;
    const pass = passRef.current;
    if (!video || !nasun || !genesis || !pass) return;
    let rafId: number;
    const fade = (
      t: number,
      inStart: number,
      inEnd: number,
      outStart: number,
      outEnd: number,
    ) => {
      if (t < inStart) return 0;
      if (t < inEnd) return (t - inStart) / (inEnd - inStart);
      if (t < outStart) return 1;
      if (t < outEnd) return 1 - (t - outStart) / (outEnd - outStart);
      return 0;
    };
    const clamp = (v: number) => String(Math.max(0, Math.min(1, v)));
    const tick = () => {
      const t = video.currentTime;
      // NASUN: fade in 0s->2s, fade out 3s->6s
      nasun.style.opacity = clamp(fade(t, 0, 2, 3, 6));
      // GENESIS: fade in 14s->17s, fade out 20s->23s
      genesis.style.opacity = clamp(fade(t, 14, 17, 20, 23));
      // PASS: fade in 16s->19s, fade out 20s->23s
      pass.style.opacity = clamp(fade(t, 16, 19, 20, 23));
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <div className="bg-black min-h-screen">
      {/* Hero Section - outside PageLayout to remove top padding */}
      <div className="relative h-[75vh] md:h-screen overflow-hidden bg-black mb-8 md:mb-0">
        {/* Background video (poster shown while loading; skipped on slow connections) */}
        <div className="absolute inset-0 flex justify-center bg-black">
          {skipVideo ? (
            <img
              src="/videos/genesis-pass-poster.webp"
              alt=""
              className="h-full max-w-[1920px] w-full object-cover object-[calc(50%+10px)] md:object-center"
            />
          ) : (
            <video
              ref={videoRef}
              className="h-full max-w-[1920px] w-full object-cover object-[calc(50%+10px)] md:object-center"
              src="/videos/Nasun_Triangle_ZoomIn-16x9_4K.mp4"
              poster="/videos/genesis-pass-poster.webp"
              autoPlay
              muted
              loop
              playsInline
              onCanPlay={(e) => {
                // iOS Safari needs explicit play() call for autoplay
                const v = e.currentTarget;
                if (v.paused) v.play().catch(() => {});
              }}
            />
          )}
        </div>

        {/* Gradient overlay */}
        <div
          className="absolute inset-0 -mb-[2px] pointer-events-none z-10"
          style={{
            background:
              "linear-gradient(to bottom, transparent 50%, rgb(25, 22, 21) 95%)",
          }}
        />

        {/* NASUN title - fade in 0s, fades out at 3s */}
        <div
          ref={nasunRef}
          className="absolute inset-0 z-20 flex flex-col items-center justify-end pb-[20%] md:pb-[15%] opacity-0"
        >
          <h1 className="!font-changeling font-bold uppercase text-nasun-white tracking-widest !text-[clamp(3rem,10vw,6rem)] leading-none">
            NASUN
          </h1>
          {/* Invisible placeholder matching PASS height to align NASUN top with GENESIS top */}
          <h1
            className="!text-[clamp(3rem,10vw,6rem)] leading-none -mt-1 invisible"
            aria-hidden="true"
          >
            &nbsp;
          </h1>
        </div>

        {/* GENESIS + PASS titles - fade in at 14s/16s, fade out at 20s */}
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-end pb-[15%] md:pb-[11%]">
          <h1
            ref={genesisRef}
            className="!font-changeling font-bold uppercase text-nasun-white tracking-widest opacity-0 !text-[clamp(3rem,10vw,6rem)] leading-none"
          >
            GENESIS
          </h1>
          <h1
            ref={passRef}
            className="!font-changeling font-medium uppercase text-nasun-white tracking-widest opacity-0 !text-[clamp(3rem,10vw,6rem)] leading-none -mt-3"
          >
            PASS
          </h1>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-6 inset-x-0 z-30 hidden md:flex justify-center">
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

      <PageLayout>
        {/* Description + CTA Section */}
        <SectionLayout titleAlign="center">
          <div className="flex flex-col items-center gap-8 py-16 md:py-24">
            {/* Header */}
            <div className="text-center max-w-2xl space-y-0  md:space-y-2 lg:space-y-4">
              <div>
                <p className="text-nasun-nw4 font-medium tracking-widest  mb-2">
                  Discover Nasun
                </p>
                <h3 className="text-nasun-white font-semibold uppercase">
                  Genesis Pass
                </h3>
              </div>
              <p className="text-nasun-white/60 text-base md:text-lg leading-relaxed mx-auto">
                Gain first access to the Nasun ecosystem. <br />
                Test apps on devnet and testnet to earn and accumulate points.
              </p>
            </div>

            {/* Featured Apps - 3 cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5 w-full max-w-4xl">
              {[
                { name: "Pado", desc: "DeFi platform with social layer" },
                {
                  name: "Nasun AI",
                  desc: "AI infra for governance and compliance",
                },
                {
                  name: "SPECTRA",
                  desc: "Sci-fi multiplayer shooter built in UE5",
                },
              ].map((app) => (
                <div
                  key={app.name}
                  className="border border-nasun-c7/30 rounded-sm p-5 md:p-6 bg-nasun-c6/30 hover:bg-nasun-white/[0.04] hover:border-nasun-nw2/30 transition-all duration-300"
                >
                  <h6 className="text-nasun-white  mb-2">{app.name}</h6>
                  <p className="text-nasun-white/70 ">{app.desc}</p>
                </div>
              ))}
            </div>

            {/* CTA */}
            <div className="flex flex-col items-center gap-12 py-8">
              <div className="mx-auto max-w-sm space-y-1 ">
                <p>• $8 Allowlist GTD Full</p>
                <p>• $10 Allowlist FCFS</p>
                <p>• $15 Public Sale</p>
              </div>

              <ButtonV3
                variant="nw2"
                size="lg"
                className="min-w-[220px]"
                onClick={handleOpen}
              >
                Apply for Allowlist FCFS
              </ButtonV3>
              <p className="text-nasun-white/60 text-base md:text-lg leading-relaxed mx-auto text-center mt-2">
                The first 100 to register will be placed on the Guaranteed
                Allowlist. <br />
                The total mint supply and date will be revealed on OpenSea.
              </p>
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
    </div>
  );
};

export default DevGenesisPassPage;
