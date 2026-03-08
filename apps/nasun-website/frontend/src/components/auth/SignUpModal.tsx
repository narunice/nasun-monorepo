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
  onWalletLogin?: () => void;
}

export function SignUpModal({
  isOpen,
  onClose,
  twitterOnly = false,
  onWalletLogin,
}: SignUpModalProps) {
  const navigate = useNavigate();
  const { isAuthenticated, signInWithGoogle, signInWithTwitter } = useAuth();
  const [isSigningIn, setIsSigningIn] = useState(false);

  const isTwitterAuthAvailable = !!import.meta.env.VITE_TWITTER_AUTH_API;

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
            {/* Wallet Login Section */}
            {!twitterOnly && onWalletLogin && (
              <>
                <p className="text-[11px] text-nasun-black/40 uppercase tracking-wider font-medium">
                  Wallet Login for Privacy
                </p>
                <button
                  onClick={onWalletLogin}
                  className={providerBtnClass}
                >
                  <img src="/nasun_symbol_black.svg" alt="" className="w-5 h-5" />
                  Login / Register with Nasun Wallet
                </button>
                <div className="border-t border-nasun-black/10 my-1" />
                <p className="text-[11px] text-nasun-black/40 uppercase tracking-wider font-medium">
                  Social Login for Ease
                </p>
              </>
            )}

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
              <button
                onClick={() => handleSignIn("google")}
                disabled={isSigningIn}
                className={providerBtnClass}
              >
                <img src="/Google__G__logo.svg" alt="Google" className="w-5 h-5" />
                {isSigningIn ? <InlineLoading size="sm" /> : "Continue with Google"}
              </button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
