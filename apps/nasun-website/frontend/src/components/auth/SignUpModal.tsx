import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useAuth, WalletLoginButton as MetaMaskLoginButton } from "@/features/auth";
import { InlineLoading } from "@/components/ui/InlineLoading";

interface SignUpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SignUpModal({ isOpen, onClose }: SignUpModalProps) {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const {
    isAuthenticated,
    signInWithGoogle,
    signInWithTwitter,
    signInWithMetaMask,
  } = useAuth();
  const [isSigningIn, setIsSigningIn] = useState(false);

  const isTwitterAuthAvailable = !!import.meta.env.VITE_TWITTER_AUTH_API;
  const isMetaMaskEnabled = import.meta.env.VITE_ENABLE_METAMASK_LOGIN === "true";

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

  const handleMetaMaskSuccess = async (
    identityId: string,
    _token: string,
    walletAddress: string
  ) => {
    try {
      await signInWithMetaMask(identityId, walletAddress);
      onClose();
      navigate("/my-account");
    } catch (error) {
      console.error("Error saving MetaMask user data:", error);
    }
  };

  const handleMetaMaskError = (error: Error) => {
    console.error("MetaMask login error:", error);
  };

  const providerBtnClass =
    "flex items-center justify-center gap-3 w-full px-4 py-3 rounded-lg text-sm font-medium text-nasun-black/80 bg-gray-100 hover:bg-gray-200 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isSigningIn) onClose();
      }}
    >
      <DialogContent
        className="bg-nasun-white border-gray-200 max-w-sm"
        onEscapeKeyDown={(e) => { if (isSigningIn) e.preventDefault(); }}
        onPointerDownOutside={(e) => { if (isSigningIn) e.preventDefault(); }}
      >
        <DialogHeader>
          <DialogTitle className="text-nasun-black text-xl font-semibold text-center">
            Join Nasun
          </DialogTitle>
          <DialogDescription className="text-nasun-black/60 text-center">
            Choose your sign-up method
          </DialogDescription>
        </DialogHeader>

        {isAuthenticated ? (
          <div className="flex flex-col items-center gap-4 py-4">
            <p className="text-nasun-black/70 text-sm text-center">
              You are already signed in.
            </p>
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
            <button
              onClick={() => handleSignIn("google")}
              disabled={isSigningIn}
              className={providerBtnClass}
            >
              <img src="/Google__G__logo.svg" alt="Google" className="w-5 h-5" />
              {isSigningIn ? <InlineLoading size="sm" /> : "Continue with Google"}
            </button>

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

            {isMetaMaskEnabled && (
              <MetaMaskLoginButton
                className={providerBtnClass}
                onSuccess={handleMetaMaskSuccess}
                onError={handleMetaMaskError}
              />
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
