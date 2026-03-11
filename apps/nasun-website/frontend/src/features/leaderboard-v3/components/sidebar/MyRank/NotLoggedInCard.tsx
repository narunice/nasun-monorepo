import { useState, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WalletConnect } from "@nasun/wallet-ui";
import { useWallet, useZkLogin, getPendingBackupMnemonic } from "@nasun/wallet";
import { useNasunWalletAuth } from "@/features/wallet/hooks/useNasunWalletAuth";

export function NotLoggedInCard() {
  const navigate = useNavigate();
  const { status, signFlow } = useNasunWalletAuth();
  const { isConnected: isZkConnected } = useZkLogin();

  const [modalOpen, setModalOpen] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const signFlowCalledRef = useRef(false);

  const isAnyConnected = status === "unlocked" || isZkConnected;

  const handleWalletUnlocked = useCallback(async () => {
    if (signFlowCalledRef.current) return;
    signFlowCalledRef.current = true;
    const hasPendingBackup = !!getPendingBackupMnemonic();
    setSigningIn(true);
    try {
      await signFlow();
      setModalOpen(false);
      navigate("/my-account");
      if (hasPendingBackup) {
        window.dispatchEvent(new CustomEvent("nasun:wallet-backup-pending"));
      }
    } catch (err) {
      signFlowCalledRef.current = false;
      setSigningIn(false);
      if (import.meta.env.DEV) console.error("[wallet auth]", err);
    }
  }, [signFlow, navigate]);

  // Already-unlocked wallet: trigger signFlow immediately on modal open
  useEffect(() => {
    if (modalOpen && isAnyConnected) handleWalletUnlocked();
  }, [modalOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset guards when modal closes
  useEffect(() => {
    if (!modalOpen) {
      signFlowCalledRef.current = false;
      setSigningIn(false);
    }
  }, [modalOpen]);

  // Close modal on Escape
  useEffect(() => {
    if (!modalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !signingIn) setModalOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [modalOpen, signingIn]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (!modalOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [modalOpen]);

  return (
    <>
      <div className="p-5 bg-gradient-to-br from-nasun-c5/20 to-nasun-c4/30 border border-white/10 rounded-sm">
        <div className="flex items-start gap-3 mb-4">
          <div className="p-2 bg-nasun-c7/20 rounded-lg">
            <Trophy className="w-5 h-5 text-nasun-c7" />
          </div>
          <div>
            <h4 className="font-bold text-nasun-white text-sm uppercase tracking-tight">
              My Rank
            </h4>
            <p className="text-xs text-nasun-white/50 mt-0.5">
              Sign in to see your rank
            </p>
          </div>
        </div>
        <Button
          onClick={() => setModalOpen(true)}
          variant="c4"
          size="sm"
          className="w-full text-xs"
        >
          <img src="/nasun_symbol_white.svg" alt="" className="w-3.5 h-3.5 mr-1.5" />
          Login with Nasun Wallet
        </Button>
      </div>

      {modalOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex flex-col overflow-y-auto p-4 bg-nasun-black/60 backdrop-blur-sm animate-in fade-in-0"
            onClick={() => {
              if (!signingIn) setModalOpen(false);
            }}
          >
            <div
              className="relative m-auto bg-white dark:bg-zinc-900 rounded-lg shadow-xl max-w-sm w-full shrink-0 animate-in fade-in-0 zoom-in-95 border border-gray-200 dark:border-zinc-700"
              onClick={(e) => e.stopPropagation()}
            >
              {!signingIn && (
                <button
                  className="absolute top-3 right-3 z-10 text-gray-400 dark:text-zinc-500 hover:text-gray-600 dark:hover:text-zinc-300 transition-colors p-1"
                  onClick={() => setModalOpen(false)}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              )}

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
    </>
  );
}
