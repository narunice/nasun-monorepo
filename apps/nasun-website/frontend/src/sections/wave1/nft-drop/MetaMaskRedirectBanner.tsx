import { useState, useEffect } from "react";
import { X } from "lucide-react";

function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function isIOSSafari(): boolean {
  const ua = navigator.userAgent;
  return isIOS() && /Safari/.test(ua) && !/CriOS|FxiOS|OPiOS|EdgiOS/.test(ua);
}

function isMobile(): boolean {
  return /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
}

function isMetaMaskBrowser(): boolean {
  return typeof window !== "undefined" && !!(window as any).ethereum?.isMetaMask;
}

function getMetaMaskDeepLink(): string {
  const currentUrl = window.location.href;
  return `https://metamask.app.link/dapp/${currentUrl.replace(/^https?:\/\//, "")}`;
}

export function MetaMaskRedirectBanner() {
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Show banner for mobile users who are NOT on MetaMask in-app browser
    // and NOT on iPhone Safari (which has its own WalletConnect flow)
    if (isMobile() && !isMetaMaskBrowser() && !isIOSSafari()) {
      setShow(true);
    }
  }, []);

  if (!show || dismissed) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 sm:p-6">
      <div
        className="mx-auto max-w-lg rounded-2xl border border-amber-500/30 p-4 sm:p-5 shadow-2xl"
        style={{
          background:
            "linear-gradient(135deg, rgba(20,18,16,0.97) 0%, rgba(40,30,20,0.97) 100%)",
          backdropFilter: "blur(20px)",
        }}
      >
        <button
          onClick={() => setDismissed(true)}
          className="absolute top-3 right-3 text-nasun-white/40 hover:text-nasun-white/80 transition-colors"
          aria-label="Dismiss"
        >
          <X size={18} />
        </button>

        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M20.5 4L12.5 10l1.5-3.5L20.5 4z" fill="#E2761B" />
              <path d="M3.5 4l7.9 6.1L10 6.5 3.5 4z" fill="#E4761B" />
              <path d="M17.5 16.5l-2 3.5 4.5 1.2-1.3-4.7h-1.2z" fill="#E4761B" />
              <path d="M5.3 16.5L4 21.2l4.5-1.2-2-3.5H5.3z" fill="#E4761B" />
              <path d="M8.2 10.7L7 12.5l4.5.2-.2-4.7-3.1 2.7z" fill="#E4761B" />
              <path d="M15.8 10.7l-3.2-2.8-.1 4.8 4.5-.2-1.2-1.8z" fill="#E4761B" />
              <path d="M8.5 19.7l2.7-1.3-2.3-1.8-.4 3.1z" fill="#E4761B" />
              <path d="M12.8 18.4l2.7 1.3-.4-3.1-2.3 1.8z" fill="#E4761B" />
            </svg>
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-nasun-white text-sm font-semibold leading-tight">
              Open in MetaMask for the best minting experience
            </p>
            <p className="text-nasun-white/50 text-xs mt-1 leading-relaxed">
              Mobile browsers may have connection issues. Use MetaMask's built-in browser for a reliable mint.
            </p>
          </div>
        </div>

        <a
          href={getMetaMaskDeepLink()}
          className="mt-3 block w-full rounded-xl py-2.5 text-center text-sm font-semibold transition-all"
          style={{
            background: "linear-gradient(135deg, #E2761B 0%, #CD6116 100%)",
            color: "#fff",
          }}
        >
          Open in MetaMask
        </a>
      </div>
    </div>
  );
}
