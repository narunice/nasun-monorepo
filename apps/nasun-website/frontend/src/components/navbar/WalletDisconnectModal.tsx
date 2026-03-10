import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useWallet, useZkLogin, usePasskeyStore, clearSessionPassword } from "@nasun/wallet";

/**
 * Detects when the wallet is disconnected while the user is still
 * authenticated (Cognito session active) and shows a modal asking
 * the user to either continue browsing or sign out.
 *
 * "Wallet exists" = self-custody keystore present (locked or unlocked)
 *                   OR zkLogin connected
 *                   OR passkey wallet registered.
 *
 * Only a true→false transition of hasWallet triggers the modal.
 * Intentional sign-outs (LoginButton / WalletButton) dispatch
 * 'nasun:signing-out' before touching wallet state so we can skip.
 */
export default function WalletDisconnectModal() {
  const navigate = useNavigate();
  const { isAuthenticated, logout } = useAuth();
  const { status: walletStatus, lockWallet } = useWallet();
  const { isConnected: isZkConnected, logout: zkLogout } = useZkLogin();
  const passkeyAddress = usePasskeyStore((s) => s.address);

  const [showModal, setShowModal] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const signingOutRef = useRef(false);
  const prevHasWalletRef = useRef<boolean | null>(null);

  const hasWallet =
    walletStatus !== "disconnected" || isZkConnected || passkeyAddress !== null;

  // Listen for intentional sign-out events (dispatchEvent is synchronous per DOM spec)
  useEffect(() => {
    const handler = () => {
      signingOutRef.current = true;
    };
    window.addEventListener("nasun:signing-out", handler);
    return () => window.removeEventListener("nasun:signing-out", handler);
  }, []);

  // Detect wallet existence true → false transition
  useEffect(() => {
    // Skip initial render
    if (prevHasWalletRef.current === null) {
      prevHasWalletRef.current = hasWallet;
      return;
    }

    if (
      prevHasWalletRef.current &&
      !hasWallet &&
      isAuthenticated &&
      !signingOutRef.current
    ) {
      setShowModal(true);
    }

    prevHasWalletRef.current = hasWallet;
    // Reset flag after processing the transition
    signingOutRef.current = false;
  }, [hasWallet, isAuthenticated]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (!showModal) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [showModal]);

  const handleSignOut = async () => {
    try {
      setIsSigningOut(true);
      zkLogout();
      lockWallet();
      usePasskeyStore.getState().lock();
      clearSessionPassword();
      await logout();
      navigate("/logout");
    } catch {
      navigate("/logout");
    } finally {
      setIsSigningOut(false);
    }
  };

  if (!showModal) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-nasun-black/60 backdrop-blur-sm animate-in fade-in-0">
      <div className="relative m-auto bg-white dark:bg-zinc-900 rounded-lg shadow-xl max-w-sm w-full mx-4 p-6 animate-in fade-in-0 zoom-in-95 border border-gray-200 dark:border-zinc-700">
        {/* Icon */}
        <div className="flex justify-center mb-4">
          <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
            <svg
              className="w-6 h-6 text-amber-600 dark:text-amber-400"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
              />
            </svg>
          </div>
        </div>

        {/* Title */}
        <h2 className="text-center text-lg font-semibold text-gray-900 dark:text-white mb-2">
          Wallet Disconnected
        </h2>

        {/* Description */}
        <p className="text-center text-sm text-gray-500 dark:text-zinc-400 mb-6">
          Your wallet has been disconnected, but you're still signed in to the
          website.
        </p>

        {/* Actions */}
        <div className="flex flex-col gap-3">
          <button
            onClick={() => setShowModal(false)}
            className="w-full py-2.5 px-4 rounded-lg text-sm font-medium bg-gray-100 dark:bg-zinc-800 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
          >
            Continue Browsing
          </button>
          <button
            onClick={handleSignOut}
            disabled={isSigningOut}
            className="w-full py-2.5 px-4 rounded-lg text-sm font-medium bg-nasun-c1 text-nasun-black hover:brightness-90 disabled:opacity-50 transition-all cursor-pointer"
          >
            {isSigningOut ? "Signing out..." : "Sign out from the website"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
