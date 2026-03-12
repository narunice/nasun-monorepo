import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useState, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import * as Tooltip from "@radix-ui/react-tooltip";
import { ExitIcon, EnterIcon } from "@radix-ui/react-icons";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useWallet, useZkLogin, usePasskeyStore, clearSessionPassword } from "@nasun/wallet";
import { WalletConnect } from "@nasun/wallet-ui";
import { useNasunWalletAuth } from "@/features/wallet/hooks/useNasunWalletAuth";
import { getPendingBackupMnemonic } from "@nasun/wallet";

const LoginButton = () => {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const {
    user,
    isLoading,
    isAuthenticated,
    logout,
  } = useAuth();
  const { lockWallet } = useWallet();
  const { logout: zkLogout, isConnected: isZkConnected } = useZkLogin();
  const { status, signFlow } = useNasunWalletAuth();

  const [isSigningOut, setIsSigningOut] = useState(false);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const signFlowCalledRef = useRef(false);
  const externalTriggerRef = useRef(false);

  const isAnyConnected = status === 'unlocked' || isZkConnected;

  // Wallet unlock → auth flow (signFlow)
  const handleWalletUnlocked = useCallback(async () => {
    if (signFlowCalledRef.current) return;
    signFlowCalledRef.current = true;
    // Capture before signFlow — pendingBackupMnemonic is set during createWalletWithBackup
    const hasPendingBackup = !!getPendingBackupMnemonic();
    setSigningIn(true);
    try {
      await signFlow();
      setLoginModalOpen(false);
      // Skip navigation when login was triggered externally (e.g., from Genesis Pass page)
      if (!externalTriggerRef.current) {
        navigate('/my-account');
      }
      externalTriggerRef.current = false;
      // Signal WalletButton to auto-open for backup completion
      if (hasPendingBackup) {
        window.dispatchEvent(new CustomEvent('nasun:wallet-backup-pending'));
      }
    } catch (err) {
      signFlowCalledRef.current = false;
      setSigningIn(false);
      if (import.meta.env.DEV) console.error('[wallet auth]', err);
    }
  }, [signFlow, navigate]);

  // Already-unlocked wallet: trigger signFlow immediately on modal open.
  // WalletConnect's onWalletUnlocked doesn't fire if wallet is already connected at mount.
  useEffect(() => {
    if (loginModalOpen && isAnyConnected) handleWalletUnlocked();
  }, [loginModalOpen]); // eslint-disable-line react-hooks/exhaustive-deps -- status transitions handled by onWalletUnlocked

  // Reset guards when modal closes
  useEffect(() => {
    if (!loginModalOpen) {
      signFlowCalledRef.current = false;
      externalTriggerRef.current = false;
      setSigningIn(false);
    }
  }, [loginModalOpen]);

  // Close modal on Escape key
  useEffect(() => {
    if (!loginModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !signingIn) setLoginModalOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [loginModalOpen, signingIn]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (!loginModalOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [loginModalOpen]);

  // Allow other components to trigger the login modal via custom event
  useEffect(() => {
    const handleOpenLogin = () => {
      if (!isAuthenticated) {
        externalTriggerRef.current = true;
        setLoginModalOpen(true);
      }
    };
    window.addEventListener("nasun:open-login", handleOpenLogin);
    return () => window.removeEventListener("nasun:open-login", handleOpenLogin);
  }, [isAuthenticated]);

  const handleSignOut = async () => {
    try {
      setIsSigningOut(true);
      window.dispatchEvent(new CustomEvent("nasun:signing-out"));
      zkLogout();
      lockWallet();
      usePasskeyStore.getState().lock();
      clearSessionPassword();
      await logout();
      navigate("/logout");
    } catch (err) {
      console.error("Error signing out:", err);
      navigate("/logout");
    } finally {
      setIsSigningOut(false);
    }
  };

  if (isLoading) {
    return (
      <button
        disabled
        className="rounded-lg cursor-not-allowed p-2 text-nasun-black opacity-50"
      >
        Loading...
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {isAuthenticated ? (
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <button
              onClick={handleSignOut}
              disabled={isSigningOut}
              className="rounded-lg cursor-pointer p-1 text-nasun-black hover:opacity-70 disabled:opacity-50 transition-all  "
            >
              {isSigningOut ? <div className="loading-spinner" /> : <ExitIcon className="size-5 xl:size-6" />}
            </button>
          </Tooltip.Trigger>
          <Tooltip.Content
            side="bottom"
            align="center"
            sideOffset={5}
            className="max-w-[150px] px-2 py-1 bg-gray-300 text-nasun-black/70 text-xs border border-gray-500 rounded-lg"
          >
            {user?.provider && `${user.provider} • `}
            {t("auth.logout")}
          </Tooltip.Content>
        </Tooltip.Root>
      ) : (
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <button
              onClick={() => setLoginModalOpen(true)}
              className="rounded-lg cursor-pointer p-1 text-nasun-black hover:opacity-70 transition-all"
            >
              <EnterIcon className="size-5 xl:size-6" />
            </button>
          </Tooltip.Trigger>
          <Tooltip.Content
            side="bottom"
            align="center"
            sideOffset={8}
            className="max-w-[150px] px-2 py-1 bg-gray-300 text-nasun-black/70 text-xs border border-gray-500 rounded-lg"
          >
            Sign Up / Login
          </Tooltip.Content>
        </Tooltip.Root>
      )}

      {/* Login Modal — portalled to body to escape navbar overflow constraints */}
      {loginModalOpen && !isAuthenticated && createPortal(
          <div
            className="fixed inset-0 z-[9999] flex flex-col overflow-y-auto p-4 bg-nasun-black/60 backdrop-blur-sm animate-in fade-in-0"
            onClick={() => { if (!signingIn) setLoginModalOpen(false); }}
          >
            <div
              className="relative m-auto bg-white dark:bg-zinc-900 rounded-lg shadow-xl max-w-sm w-full shrink-0 animate-in fade-in-0 zoom-in-95 border border-gray-200 dark:border-zinc-700"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close button — hidden during signFlow */}
              {!signingIn && (
                <button
                  className="absolute top-3 right-3 z-10 text-gray-400 dark:text-zinc-500 hover:text-gray-600 dark:hover:text-zinc-300 transition-colors p-1"
                  onClick={() => setLoginModalOpen(false)}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}

              {/* Wallet Section or Signing In indicator */}
              {signingIn ? (
                <div className="px-5 py-8 text-center space-y-3">
                  <div className="loading-spinner mx-auto" />
                  <p className="text-sm text-gray-500 dark:text-zinc-400">Signing in...</p>
                </div>
              ) : (
                <WalletConnect
                  embedded
                  defaultOpen
                  onWalletUnlocked={handleWalletUnlocked}
                  showPrivacyNotice
                  lockedTitle="Unlock Wallet to Login"
                />
              )}
            </div>
          </div>,
          document.body,
      )}
    </div>
  );
};

export default LoginButton;
