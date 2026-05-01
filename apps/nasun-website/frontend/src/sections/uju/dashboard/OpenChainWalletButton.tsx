import { FC, ReactNode, useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import { UjuButton } from "../shared";

export interface InstallSuggestion {
  name: string;
  url: string;
}

interface OpenChainWalletButtonProps {
  /** Display name of the chain (e.g. "Sui", "Solana"). Used in dropdown title. */
  chainLabel: string;
  /** Detected wallet names (`useWallets()` for Sui, custom probe for Sol). */
  installed: string[];
  /** Currently connected address — if present, dropdown shows account view. */
  connectedAddress?: string | null;
  /** Wallet name currently connected (for "via X" label in account view). */
  connectedWalletName?: string | null;
  /** Triggers the wallet's connect popup. Resolves to address or null. */
  onConnect: (walletName: string) => Promise<string | null>;
  /** Severs the dapp-side session. Wallet extension keeps its own state. */
  onDisconnect?: () => Promise<void> | void;
  /** True while a connect/disconnect request is in-flight. */
  isConnecting?: boolean;
  /**
   * Suggestions shown when no wallet is detected. Each links to the wallet's
   * download page so the user has a clear next step instead of a silent
   * disabled button.
   */
  installSuggestions?: InstallSuggestion[];
}

function shorten(addr: string): string {
  return addr.length <= 12 ? addr : `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/**
 * Compact "Open" pill that reveals a state-aware dropdown:
 *   - Connected      → address + "Disconnect"
 *   - Not connected, 1+ installed → wallet picker
 *   - 0 installed    → "no wallet detected" + install links
 *
 * Used by SUI and SOL rows in the Wallet Integration card. The dropdown
 * ALWAYS opens on click so the user gets visible feedback regardless of
 * detection / connection state. Connect outcomes are surfaced as toasts so
 * the popup-blocked / extension-busy edge cases don't fail silently.
 */
export const OpenChainWalletButton: FC<OpenChainWalletButtonProps> = ({
  chainLabel,
  installed,
  connectedAddress,
  connectedWalletName,
  onConnect,
  onDisconnect,
  isConnecting = false,
  installSuggestions = [],
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [open]);

  const onPick = async (name: string) => {
    setOpen(false);
    toast.info(`Opening ${name}…`);
    const addr = await onConnect(name);
    if (addr) toast.success(`${chainLabel} wallet connected: ${shorten(addr)}`);
    // onConnect's hook handles error state internally and rejects to null;
    // surface a generic toast only when we got null AND wallet was installed.
    else if (installed.includes(name)) {
      toast.error(`Connection rejected or failed for ${name}`);
    }
  };

  const onDisconnectClick = async () => {
    setOpen(false);
    if (!onDisconnect) return;
    try {
      await onDisconnect();
      toast.info(`${chainLabel} wallet disconnected`);
    } catch {
      // ignore — extension may have already disconnected
    }
  };

  let body: ReactNode;
  if (connectedAddress) {
    body = (
      <div className="px-3 py-2.5 text-sm">
        <div className="text-uju-secondary text-xs uppercase tracking-wider mb-1">
          Connected{connectedWalletName ? ` via ${connectedWalletName}` : ""}
        </div>
        <div className="font-mono text-uju-primary mb-3">
          {shorten(connectedAddress)}
        </div>
        <p className="text-xs text-uju-secondary mb-2 leading-snug">
          To view balances or send transactions, open the wallet extension
          directly from your browser toolbar.
        </p>
        {onDisconnect && (
          <button
            type="button"
            onClick={onDisconnectClick}
            className="w-full text-center px-3 py-1.5 rounded-full text-sm border border-nasun-coral/40 text-nasun-coral hover:bg-nasun-coral/10 transition-colors"
          >
            Disconnect
          </button>
        )}
      </div>
    );
  } else if (installed.length === 0) {
    body = (
      <div className="px-3 py-2.5 text-sm">
        <div className="text-uju-secondary text-xs uppercase tracking-wider mb-1">
          No {chainLabel} wallet detected
        </div>
        <p className="text-xs text-uju-secondary leading-snug mb-2">
          Install one of the following browser extensions, then refresh.
        </p>
        <ul className="space-y-1">
          {installSuggestions.map((s) => (
            <li key={s.name}>
              <a
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block px-2 py-1.5 rounded text-sm text-pado-3 hover:bg-uju-bg/60 transition-colors"
              >
                Get {s.name} ↗
              </a>
            </li>
          ))}
        </ul>
      </div>
    );
  } else {
    body = (
      <div className="py-1">
        <div className="px-3 py-1.5 text-uju-secondary text-xs uppercase tracking-wider">
          Connect {chainLabel} wallet
        </div>
        {installed.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => onPick(name)}
            disabled={isConnecting}
            className="w-full text-left px-3 py-2 text-sm text-uju-primary hover:bg-uju-bg/60 transition-colors capitalize disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {name}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <UjuButton
        variant="ghost"
        size="xs"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {isConnecting ? "Opening…" : "Open"}
      </UjuButton>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-8 z-50 min-w-[220px] rounded-xl border border-uju-border/60 bg-uju-card shadow-2xl"
        >
          {body}
        </div>
      )}
    </div>
  );
};
