import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import * as Tooltip from "@radix-ui/react-tooltip";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useWallet, useZkLogin } from "@nasun/wallet";
import { WalletConnect } from "@nasun/wallet-ui";

export default function WalletButton() {
  const { logout } = useAuth();
  const { status } = useWallet();
  const { isConnected: isZkConnected } = useZkLogin();

  const [modalOpen, setModalOpen] = useState(false);

  // True wallet disconnected = no keystore, no zkLogin, no passkey
  const isWalletDisconnected = status === "disconnected" && !isZkConnected;

  // Close modal on Escape key
  useEffect(() => {
    if (!modalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setModalOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [modalOpen]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (!modalOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [modalOpen]);

  const handleSessionExpiredLogout = async () => {
    setModalOpen(false);
    try { await logout(); } catch { /* noop */ }
    window.location.href = "/";
  };

  return (
    <>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button
            onClick={() => setModalOpen(true)}
            className="rounded-lg cursor-pointer p-1 text-nasun-black hover:opacity-70 transition-all"
            aria-label="Wallet"
          >
            <svg className="size-5 xl:size-6" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 0 0-2.25-2.25H15a3 3 0 1 1 0-6h.75A2.25 2.25 0 0 1 18 6v0M3 6v12a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3V9a3 3 0 0 0-3-3H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3h12" />
            </svg>
          </button>
        </Tooltip.Trigger>
        <Tooltip.Content
          side="bottom"
          align="center"
          sideOffset={5}
          className="max-w-[150px] px-2 py-1 bg-gray-300 text-nasun-black/70 text-xs border border-gray-500 rounded-lg"
        >
          Nasun Wallet
        </Tooltip.Content>
      </Tooltip.Root>

      {modalOpen && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex flex-col overflow-y-auto p-4 bg-nasun-black/60 backdrop-blur-sm animate-in fade-in-0"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="relative m-auto bg-white dark:bg-zinc-800 rounded-lg shadow-xl max-w-sm w-full shrink-0 animate-in fade-in-0 zoom-in-95 border border-gray-200 dark:border-zinc-700"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-2">
              <h2 className="text-gray-900 dark:text-white text-lg font-semibold tracking-wide">
                Nasun Wallet
              </h2>
              <button
                className="text-gray-400 dark:text-zinc-500 hover:text-gray-600 dark:hover:text-zinc-300 transition-colors p-1"
                onClick={() => setModalOpen(false)}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            {isWalletDisconnected ? (
              <div className="px-5 pb-5 text-center space-y-3">
                <p className="text-sm text-gray-500 dark:text-zinc-400">
                  Wallet not found. Please sign in again.
                </p>
                <button
                  onClick={handleSessionExpiredLogout}
                  className="w-full py-2 px-4 rounded-lg bg-gray-200 dark:bg-zinc-700 text-gray-700 dark:text-zinc-200 hover:bg-gray-300 dark:hover:bg-zinc-600 transition-colors text-sm"
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <WalletConnect
                embedded
                defaultOpen
                onDropdownClose={() => setModalOpen(false)}
              />
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
