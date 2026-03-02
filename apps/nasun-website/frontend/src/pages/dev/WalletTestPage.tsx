// Dev-only page for testing wagmi + RainbowKit wallet integration (PoC).
// Route: /dev/wallet-test
// This page will be removed after the PoC validation phase.

import { useState, useCallback, useEffect, useRef } from "react";
import { useAccount, useDisconnect, useSignMessage } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { prepareChallenge, connectVerify } from "@/services/metamaskApi";

const isMobileBrowser = () => /Android|iPhone|iPad/i.test(navigator.userAgent);

// Detect MetaMask in-app browser (injected provider in webview)
const isMetaMaskInAppBrowser = () =>
  typeof window !== "undefined" &&
  Boolean(window.ethereum) &&
  /MetaMask/i.test(navigator.userAgent);

// MetaMask universal link for mobile — opens the MetaMask app
const METAMASK_DEEPLINK = "https://metamask.app.link/wc";

export default function WalletTestPage() {
  const { address, isConnected, connector } = useAccount();
  const { disconnectAsync } = useDisconnect();
  const { signMessageAsync, isPending: isSigning } = useSignMessage();

  const [log, setLog] = useState<string[]>([]);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [showWalletHint, setShowWalletHint] = useState(false);
  const signResolvedRef = useRef(false);

  const appendLog = useCallback((msg: string) => {
    const ts = new Date().toLocaleString("en-US", { hour12: false });
    setLog((prev) => [`[${ts}] ${msg}`, ...prev]);
  }, []);

  // When returning from MetaMask in-app browser's signing screen,
  // JS execution may have been suspended. Log visibility changes for debugging.
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && isAuthenticating) {
        appendLog(
          `Page visible again. signResolved=${signResolvedRef.current}, isSigning=${isSigning}`
        );
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibility);
  }, [isAuthenticating, isSigning, appendLog]);

  const isAlreadyPendingError = (err: unknown): boolean => {
    const msg = err instanceof Error ? err.message : String(err);
    return msg.includes("already pending");
  };

  const handleResetSession = useCallback(async () => {
    appendLog("Resetting session...");
    try {
      await disconnectAsync();
      appendLog("Session reset. Please reconnect your wallet.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      appendLog(`Reset error: ${msg}`);
    }
  }, [disconnectAsync, appendLog]);

  const handleAuthenticate = async () => {
    if (!isConnected || !address) {
      appendLog("ERROR: Wallet not connected");
      return;
    }

    const mobile = isMobileBrowser();
    const inApp = isMetaMaskInAppBrowser();
    const isWC = connector?.type === "walletConnect";
    const isInjected = !isWC; // metamask, injected, etc.

    setIsAuthenticating(true);
    setShowWalletHint(false);
    signResolvedRef.current = false;
    try {
      appendLog(
        `Environment: ${mobile ? "mobile" : "desktop"}, ` +
          `inAppBrowser: ${inApp}, ` +
          `connector: ${connector?.name} (${connector?.type})`
      );

      if (mobile && isInjected) {
        appendLog(
          "NOTE: Using injected provider (in-app browser). " +
            "WalletConnect v2 relay is NOT being tested in this mode."
        );
      }

      // Step 1: Prepare challenge (address-agnostic)
      appendLog("Step 1: Requesting server challenge...");
      const { nonce, message } = await prepareChallenge();
      appendLog(`Step 1 OK: nonce=${nonce.substring(0, 16)}...`);

      // Step 2: Sign message via wagmi (handles extension popup / WC relay)
      appendLog("Step 2: Requesting wallet signature...");

      // Show context-appropriate hint
      if (mobile && isWC) {
        setShowWalletHint(true);
        appendLog("Sending sign request via WalletConnect relay...");
      } else if (mobile && isInjected) {
        appendLog(
          "Requesting signature from in-app provider. " +
            "After signing, return to the Browser tab in MetaMask."
        );
      }

      // Start signing — on WC this sends the request via relay
      const signPromise = signMessageAsync({ message });

      // On mobile + WC, open MetaMask after a short delay to let relay send
      if (mobile && isWC) {
        setTimeout(() => {
          window.open(METAMASK_DEEPLINK, "_blank");
        }, 800);
      }

      const signature = await signPromise;
      signResolvedRef.current = true;
      setShowWalletHint(false);
      appendLog(`Step 2 OK: sig=${signature.substring(0, 20)}...`);

      // Step 3: Verify signature on server
      appendLog("Step 3: Verifying signature on server...");
      const result = await connectVerify(signature, nonce);
      appendLog(
        `Step 3 OK: walletAddress=${result.walletAddress}, identityId=${result.identityId}`
      );
      appendLog("AUTHENTICATION SUCCESS");
    } catch (err) {
      setShowWalletHint(false);

      if (isAlreadyPendingError(err)) {
        appendLog(
          "ERROR: A previous signing request is still pending in MetaMask. " +
            "Please open MetaMask and approve/reject it, or use 'Reset Session' below."
        );
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        appendLog(`ERROR: ${msg}`);
      }
    } finally {
      setIsAuthenticating(false);
    }
  };

  const mobile = isMobileBrowser();
  const inApp = isMetaMaskInAppBrowser();
  const isWC = connector?.type === "walletConnect";

  return (
    <main className="min-h-screen bg-nasun-black text-nasun-white p-8 pt-24">
      <div className="max-w-2xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-bold mb-2">
            Wallet PoC Test (wagmi + RainbowKit)
          </h1>
          <p className="text-nasun-white/60 text-sm">
            Tests: prepare challenge &rarr; sign message &rarr; verify
            signature. On mobile, the sign step should trigger via WalletConnect
            v2 relay (push notification) rather than a second deeplink.
          </p>
        </div>

        {/* Connect Button (RainbowKit) */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">1. Connect Wallet</h2>
          <ConnectButton />

          {/* In-app browser detection notice */}
          {mobile && inApp && isConnected && !isWC && (
            <div className="rounded-lg border border-blue-500/50 bg-blue-500/10 p-3 text-sm text-blue-200">
              <strong>In-App Browser Detected.</strong> You are inside MetaMask&apos;s
              built-in browser using the injected provider. This works, but does NOT
              test WalletConnect v2 relay.
              <br />
              <br />
              To test WC v2: Open this page in Chrome &rarr; tap Connect &rarr;
              choose &quot;WalletConnect&quot; (not MetaMask) &rarr; scan QR or use deeplink.
            </div>
          )}

          {/* WalletConnect mode confirmation */}
          {isConnected && isWC && (
            <div className="rounded-lg border border-green-500/50 bg-green-500/10 p-3 text-sm text-green-200">
              <strong>WalletConnect v2 relay active.</strong> Signing requests
              will be sent via relay. This is the target PoC test scenario.
            </div>
          )}
        </section>

        {/* Connection Status */}
        <section className="space-y-2 rounded-lg border border-nasun-white/20 p-4">
          <h2 className="text-lg font-semibold">2. Connection Status</h2>
          <div className="text-sm space-y-1 font-mono">
            <p>
              Connected:{" "}
              <span className={isConnected ? "text-green-400" : "text-red-400"}>
                {String(isConnected)}
              </span>
            </p>
            <p>Address: {address || "N/A"}</p>
            <p>Connector: {connector?.name || "N/A"} ({connector?.type || "N/A"})</p>
            <p>Transport: {isWC ? "WalletConnect v2 relay" : connector?.type || "N/A"}</p>
          </div>
          {isConnected && (
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => {
                  disconnectAsync().then(() => appendLog("Disconnected"));
                }}
                className="px-4 py-2 bg-red-600 rounded text-sm hover:bg-red-700 transition-colors"
              >
                Disconnect
              </button>
              <button
                onClick={handleResetSession}
                className="px-4 py-2 bg-yellow-600 rounded text-sm hover:bg-yellow-700 transition-colors"
              >
                Reset Session
              </button>
            </div>
          )}
        </section>

        {/* Authenticate (prepare + sign + verify) */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">
            3. Authenticate (Full Flow)
          </h2>

          {/* Mobile WalletConnect hint */}
          {showWalletHint && (
            <div className="rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-3 text-sm text-yellow-200">
              Check your MetaMask app to approve the signature request.
              If the app didn't open automatically,{" "}
              <button
                onClick={() => window.open(METAMASK_DEEPLINK, "_blank")}
                className="underline font-medium"
              >
                tap here to open MetaMask
              </button>.
            </div>
          )}

          {/* In-app browser signing hint */}
          {isAuthenticating && mobile && !isWC && (
            <div className="rounded-lg border border-blue-500/50 bg-blue-500/10 p-3 text-sm text-blue-200">
              After approving the signature, tap the <strong>Browser</strong> tab
              at the bottom of MetaMask to return here.
            </div>
          )}

          <button
            onClick={handleAuthenticate}
            disabled={!isConnected || isAuthenticating || isSigning}
            className="px-6 py-3 bg-nasun-c4 rounded-lg font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-nasun-c5 transition-colors"
          >
            {isAuthenticating || isSigning
              ? "Authenticating..."
              : "Authenticate"}
          </button>
        </section>

        {/* Log Output */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Log</h2>
            <button
              onClick={() => setLog([])}
              className="text-xs text-nasun-white/40 hover:text-nasun-white/70"
            >
              Clear
            </button>
          </div>
          <div className="bg-black/50 rounded-lg p-4 h-64 overflow-y-auto font-mono text-xs space-y-1">
            {log.length === 0 ? (
              <p className="text-nasun-white/30">
                No log entries yet. Connect a wallet and authenticate.
              </p>
            ) : (
              log.map((entry, i) => (
                <p
                  key={i}
                  className={
                    entry.includes("ERROR")
                      ? "text-red-400"
                      : entry.includes("SUCCESS")
                        ? "text-green-400"
                        : entry.includes("WARN") || entry.includes("NOTE")
                          ? "text-yellow-400"
                          : "text-nasun-white/80"
                  }
                >
                  {entry}
                </p>
              ))
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
