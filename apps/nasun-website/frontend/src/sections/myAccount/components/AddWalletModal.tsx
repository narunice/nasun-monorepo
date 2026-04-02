import { FC, useEffect, useRef, useState } from "react";
import { useWallet, useZkLogin } from "@nasun/wallet";
import { SocialLoginButtons, WalletConnect } from "@nasun/wallet-ui";

type SubView = "menu" | "import" | "create";

interface AddWalletModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AddWalletModal: FC<AddWalletModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [subView, setSubView] = useState<SubView>("menu");
  const { login: zkLogin } = useZkLogin();
  const { account, setIdentityChangeReason } = useWallet();
  const { state: zkState } = useZkLogin();
  const currentAddress = account?.address ?? zkState?.address;
  const openAddressRef = useRef<string | undefined>();

  // Set identity change reason to "add" while modal is open so that
  // wallet create/import preserves the current auth session.
  useEffect(() => {
    if (isOpen) {
      setIdentityChangeReason("add");
    } else {
      setIdentityChangeReason("switch");
    }
  }, [isOpen, setIdentityChangeReason]);

  // Reset subView and snapshot address when modal opens
  useEffect(() => {
    if (isOpen) {
      setSubView("menu");
      openAddressRef.current = currentAddress;
    }
  }, [isOpen]);

  // Close modal when wallet address changes (import or new connection)
  // Skip during create/import subView — WalletConnect's onDropdownClose handles closing
  // after the full flow (backup + auto-lock) completes
  useEffect(() => {
    if (!isOpen) return;
    if (subView === "create" || subView === "import") return;
    if (currentAddress && currentAddress !== openAddressRef.current) {
      onClose();
    }
  }, [isOpen, currentAddress, onClose, subView]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-nasun-black/70 backdrop-blur-sm z-50 animate-in fade-in-0"
        onClick={onClose}
      />
      {/* Content */}
      <div
        className="fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%] bg-gray-900 border border-nasun-nw2/30 p-6 rounded-sm max-w-sm w-[calc(100%-2rem)] shadow-lg animate-in fade-in-0 zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-nasun-white font-semibold text-base">
            Add Nasun Wallet
          </h2>
          <button
            className="text-nasun-white/30 hover:text-nasun-white/60 transition-colors"
            onClick={onClose}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p className="text-sm text-nasun-white/50 mb-4 text-center">
          Register your wallet to participate in on-chain events and earn activity-based rewards on Nasun Network.
        </p>

        {subView === "menu" ? (
          <div className="flex flex-col gap-3">
            {/* Google zkLogin */}
            <SocialLoginButtons
              providers={["google"]}
              onLogin={(provider) => zkLogin(provider)}
              size="sm"
            />

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="flex-1 border-t border-nasun-white/10" />
              <span className="text-sm text-nasun-white/30">or</span>
              <div className="flex-1 border-t border-nasun-white/10" />
            </div>

            {/* Create New Wallet */}
            <button
              onClick={() => setSubView("create")}
              className="flex items-center justify-center gap-2 w-full h-9 text-sm rounded-lg border border-nasun-white/20 text-nasun-white/70 hover:text-nasun-white hover:border-nasun-white/40 transition-all duration-200"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create New Wallet
            </button>

            {/* Import Wallet */}
            <button
              onClick={() => setSubView("import")}
              className="flex items-center justify-center gap-2 w-full h-9 text-sm rounded-lg border border-nasun-white/20 text-nasun-white/70 hover:text-nasun-white hover:border-nasun-white/40 transition-all duration-200"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Import Wallet
            </button>
          </div>
        ) : (
          <div>
            <button
              onClick={() => setSubView("menu")}
              className="flex items-center gap-1 text-sm text-nasun-white/40 hover:text-nasun-white/60 transition-colors mb-3"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>
            <div className="nasun-wallet-connect relative z-50 flex justify-center">
              <WalletConnect
                initialViewMode={subView}
                defaultOpen
                onDropdownClose={onClose}
                variant="filledOutlineC7"
                size="sm"
                triggerText={subView === "create" ? "Create Wallet" : "Import Wallet"}
                forceShowTriggerText
                dropdownPosition="bottom"
                dropdownAlign="center"
              />
            </div>
          </div>
        )}
      </div>
    </>
  );
};
