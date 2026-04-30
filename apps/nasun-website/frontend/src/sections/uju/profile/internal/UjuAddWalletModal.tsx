import { FC, useEffect, useRef, useState } from "react";
import { useWallet, useZkLogin } from "@nasun/wallet";
import { WalletConnect } from "@nasun/wallet-ui";
import { X } from "lucide-react";
import { UjuButton } from "../../shared";

type SubView = "menu" | "import" | "create";

interface UjuAddWalletModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const UjuAddWalletModal: FC<UjuAddWalletModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [subView, setSubView] = useState<SubView>("menu");
  const { account, setIdentityChangeReason } = useWallet();
  const { state: zkState } = useZkLogin();
  const currentAddress = account?.address ?? zkState?.address;
  const openAddressRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (isOpen) {
      setIdentityChangeReason("add");
    } else {
      setIdentityChangeReason("switch");
    }
  }, [isOpen, setIdentityChangeReason]);

  useEffect(() => {
    if (isOpen) {
      setSubView("menu");
      openAddressRef.current = currentAddress;
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (subView === "create" || subView === "import") return;
    if (currentAddress && currentAddress !== openAddressRef.current) {
      onClose();
    }
  }, [isOpen, currentAddress, onClose, subView]);

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
        className="fixed inset-0 bg-uju-bg/90 backdrop-blur-sm z-[9999] animate-in fade-in-0"
        onClick={onClose}
      />
      {/* Content */}
      <div
        className="fixed left-[50%] top-[50%] z-[10000] translate-x-[-50%] translate-y-[-50%] bg-uju-card border border-uju-border/30 p-6 sm:p-8 rounded-lg max-w-sm w-[calc(100%-2rem)] shadow-2xl animate-in fade-in-0 zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-uju-primary font-normal text-xl">
            Add Nasun Wallet
          </h2>
          <button
            className="text-uju-secondary hover:text-uju-primary transition-colors"
            onClick={onClose}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-uju-secondary font-light mb-6 text-center leading-relaxed">
          Link multiple Nasun wallets to one account to consolidate your activity into a single Nasun Points balance.
        </p>

        {subView === "menu" ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-uju-secondary text-center font-normal uppercase tracking-wider mb-2">
              Choose an option
            </p>

            {/* Create New Wallet */}
            <UjuButton
              onClick={() => setSubView("create")}
              variant="primary"
              className="w-full justify-center gap-2 h-12"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
              Create New Wallet
            </UjuButton>

            {/* Import Wallet */}
            <UjuButton
              onClick={() => setSubView("import")}
              variant="secondary"
              className="w-full justify-center gap-2 h-12"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Import Existing Wallet
            </UjuButton>
          </div>
        ) : (
          <div>
            <button
              onClick={() => setSubView("menu")}
              className="flex items-center gap-1.5 text-sm font-normal text-pado-2 hover:text-pado-4 transition-colors mb-4"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Options
            </button>
            <div className="nasun-wallet-connect relative z-50 flex justify-center py-4 bg-uju-bg/30 rounded-xl border border-uju-border/20">
              <WalletConnect
                initialViewMode={subView}
                defaultOpen
                onDropdownClose={onClose}
                variant="filledOutlineC7" // Keep original variant as it's a UI kit component
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
