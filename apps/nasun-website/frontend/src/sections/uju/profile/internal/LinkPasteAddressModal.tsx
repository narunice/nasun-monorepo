import { FC, useEffect, useState } from "react";
import { X } from "lucide-react";
import { UjuButton } from "../../shared";
import type { LinkPasteChain } from "@/services/userProfileApi";

const SUI_RE = /^0x[0-9a-fA-F]{64}$/;
const SOL_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

const CHAIN_META: Record<
  LinkPasteChain,
  {
    label: string;
    hint: string;
    example: string;
    validate: (raw: string) => boolean;
  }
> = {
  sui: {
    label: "SUI Wallet Address",
    hint: "Paste your SUI mainnet address (0x + 64 hex characters).",
    example: "0xa1b2... (64 hex chars)",
    validate: (raw) => SUI_RE.test(raw.trim()),
  },
  solana: {
    label: "Solana Wallet Address",
    hint: "Paste your Solana address (base58, 32-44 characters).",
    example: "5j9qK... (base58)",
    validate: (raw) => SOL_RE.test(raw.trim()),
  },
};

interface LinkPasteAddressModalProps {
  isOpen: boolean;
  chain: LinkPasteChain | null;
  initialValue?: string | null;
  isPending: boolean;
  onClose: () => void;
  onSubmit: (chain: LinkPasteChain, address: string) => Promise<boolean>;
}

export const LinkPasteAddressModal: FC<LinkPasteAddressModalProps> = ({
  isOpen,
  chain,
  initialValue,
  isPending,
  onClose,
  onSubmit,
}) => {
  const [value, setValue] = useState("");
  const [touched, setTouched] = useState(false);

  // Reset state whenever the modal opens for a different chain.
  useEffect(() => {
    if (isOpen) {
      setValue(initialValue ?? "");
      setTouched(false);
    }
  }, [isOpen, chain, initialValue]);

  // Esc closes.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen || !chain) return null;
  const meta = CHAIN_META[chain];
  const isValid = meta.validate(value);

  const handleSubmit = async () => {
    setTouched(true);
    if (!isValid || isPending) return;
    const ok = await onSubmit(chain, value.trim());
    if (ok) onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="link-paste-address-title"
        className="fixed inset-0 z-[101] flex items-center justify-center p-4"
      >
        <div
          className="w-full max-w-md rounded-2xl bg-uju-card border border-uju-border/60 shadow-[0_8px_24px_rgba(0,0,0,0.5)] p-6"
          onClick={(e) => e.stopPropagation()}
        >
          <header className="flex items-start justify-between gap-3 mb-4">
            <div>
              <h3
                id="link-paste-address-title"
                className="text-lg font-semibold text-uju-primary"
              >
                {meta.label}
              </h3>
              <p className="text-sm text-uju-secondary mt-1">{meta.hint}</p>
            </div>
            <button
              onClick={onClose}
              className="text-uju-secondary hover:text-uju-primary transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </header>

          <label className="block text-sm font-medium text-uju-secondary mb-1.5">
            Address
          </label>
          <input
            type="text"
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            placeholder={meta.example}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => setTouched(true)}
            disabled={isPending}
            className="w-full px-3 py-2.5 rounded-lg bg-uju-bg/60 border border-uju-border/60 text-base text-uju-primary placeholder:text-uju-secondary/50 font-mono focus:outline-none focus:border-pado-2/70 transition-colors disabled:opacity-50"
          />
          {touched && value && !isValid && (
            <p className="text-sm text-nasun-coral mt-1.5">
              Invalid {chain} address format.
            </p>
          )}

          <div className="mt-4 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2">
            <p className="text-sm text-amber-300/90">
              Read-only display only for now. Uju does not initiate transactions
              on {chain.charAt(0).toUpperCase() + chain.slice(1)} mainnet.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 mt-5">
            <UjuButton
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={isPending}
            >
              Cancel
            </UjuButton>
            <UjuButton
              variant="primary"
              size="sm"
              onClick={handleSubmit}
              disabled={!isValid || isPending}
            >
              {isPending
                ? "Saving..."
                : initialValue
                  ? "Replace"
                  : "Link address"}
            </UjuButton>
          </div>
        </div>
      </div>
    </>
  );
};
