import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { InlineLoading } from "@/components/ui/InlineLoading";

interface SignUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  twitterOnly?: boolean;
  onWalletConnect?: () => void;
  isWalletAuthenticating?: boolean;
  walletError?: string | null;
}

export function SignUpModal({
  isOpen,
  onClose,
  twitterOnly = false,
  onWalletConnect,
  isWalletAuthenticating = false,
  walletError = null,
}: SignUpModalProps) {
  const navigate = useNavigate();
  const { isAuthenticated, signInWithGoogle, signInWithTwitter } = useAuth();
  const [isSigningIn, setIsSigningIn] = useState(false);

  const isTwitterAuthAvailable = !!import.meta.env.VITE_TWITTER_AUTH_API;
  const isWalletLoginEnabled = import.meta.env.VITE_ENABLE_WALLET_LOGIN === "true";

  const handleSignIn = async (provider: "google" | "twitter") => {
    try {
      setIsSigningIn(true);
      if (provider === "google") {
        await signInWithGoogle();
      } else if (provider === "twitter") {
        if (!import.meta.env.VITE_TWITTER_AUTH_API) return;
        await signInWithTwitter();
      }
      onClose();
      navigate("/my-account");
    } catch (error) {
      console.error(`${provider} sign-in failed:`, error);
    } finally {
      setIsSigningIn(false);
    }
  };

  const providerBtnClass =
    "flex items-center justify-center gap-3 w-full px-4 py-3 rounded-lg text-base font-medium text-nasun-black/80 bg-gray-200 hover:bg-gray-300 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isSigningIn) onClose();
      }}
    >
      <DialogContent
        className="bg-nasun-white border-gray-200 max-w-sm"
        onEscapeKeyDown={(e) => {
          if (isSigningIn) e.preventDefault();
        }}
        onPointerDownOutside={(e) => {
          if (isSigningIn) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle
            className="text-nasun-black
          text-xl tracking-wide font-medium text-center"
          >
            {twitterOnly ? "Connect with X" : "Join Nasun"}
          </DialogTitle>
          {!isAuthenticated && (
            <DialogDescription className="text-nasun-black/80 text-center text-base">
              {twitterOnly
                ? "Sign in with your X account to participate in the leaderboard."
                : "Choose your sign-up method"}
            </DialogDescription>
          )}
        </DialogHeader>

        {isAuthenticated ? (
          <div className="flex flex-col items-center gap-4 py-4">
            <p className="text-nasun-black/80 text-sm text-center">You are already signed in.</p>
            <button
              onClick={() => {
                onClose();
                navigate("/my-account");
              }}
              className={providerBtnClass + " justify-center"}
            >
              Go to My Account
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3 pt-2">
            {isTwitterAuthAvailable && (
              <button
                onClick={() => handleSignIn("twitter")}
                disabled={isSigningIn}
                className={providerBtnClass}
              >
                <img src="/X_logo_2023.svg.png" alt="X" className="w-5 h-5" />
                {isSigningIn ? <InlineLoading size="sm" /> : "Continue with X"}
              </button>
            )}

            {!twitterOnly && (
              <>
                <button
                  onClick={() => handleSignIn("google")}
                  disabled={isSigningIn}
                  className={providerBtnClass}
                >
                  <img src="/Google__G__logo.svg" alt="Google" className="w-5 h-5" />
                  {isSigningIn ? <InlineLoading size="sm" /> : "Continue with Google"}
                </button>

                {isWalletLoginEnabled && onWalletConnect && (
                  <>
                    <button
                      onClick={onWalletConnect}
                      disabled={isWalletAuthenticating}
                      className={providerBtnClass}
                    >
                      <svg
                        className="w-5 h-5 flex-shrink-0"
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
                      {isWalletAuthenticating ? (
                        <InlineLoading size="sm" />
                      ) : walletError ? (
                        "Try Again"
                      ) : (
                        "Continue with Wallet"
                      )}
                    </button>
                    {walletError && (
                      <div className="text-sm text-red-400 px-2 py-1">{walletError}</div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
