/**
 * WCPairingView
 *
 * Allows users to pair with a dApp via:
 * 1. Displaying a QR code for mobile dApps to scan
 * 2. Pasting a WalletConnect URI from a dApp
 */

import { useState, useEffect, useCallback } from "react";
import {
  useWalletConnect,
  generateQRCodeSVG,
} from "@nasun/wallet";
import type { ViewMode } from "../connect/LockedStateUI";

interface WCPairingViewProps {
  setViewMode: (mode: ViewMode) => void;
}

type PairingTab = "qr" | "paste";

export function WCPairingView({ setViewMode }: WCPairingViewProps) {
  const { state, createPairing, pair } = useWalletConnect();
  const [activeTab, setActiveTab] = useState<PairingTab>("qr");
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [pasteUri, setPasteUri] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Generate pairing URI and QR code
  const generatePairing = useCallback(async () => {
    if (!state.initialized) return;
    setIsLoading(true);
    setError(null);
    try {
      const uri = await createPairing();
      const svg = await generateQRCodeSVG(uri, { size: 220, margin: 2 });
      setQrSvg(svg);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create pairing");
    } finally {
      setIsLoading(false);
    }
  }, [state.initialized, createPairing]);

  useEffect(() => {
    if (activeTab === "qr") {
      generatePairing();
    }
  }, [activeTab, generatePairing]);

  // Watch for session creation (pairing succeeded)
  const sessionCount = state.sessions.length;
  const [initialSessionCount] = useState(sessionCount);
  useEffect(() => {
    if (sessionCount > initialSessionCount) {
      setViewMode("wc-main");
    }
  }, [sessionCount, initialSessionCount, setViewMode]);

  // Handle URI paste and connect
  const handlePasteConnect = async () => {
    const trimmed = pasteUri.trim();
    if (!trimmed) return;

    // Basic WC URI validation
    if (!trimmed.startsWith("wc:")) {
      setError("Invalid WalletConnect URI. It should start with 'wc:'");
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      await pair(trimmed);
      // After pairing, a session_proposal event will fire.
      // The user will be directed to wc-proposal via the WC panel.
      setViewMode("wc-main");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to pair");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-4 w-full">
      {/* Back button */}
      <button
        onClick={() => setViewMode("wc-main")}
        className="flex items-center gap-1 text-sm text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors mb-3"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </button>

      <h3 className="text-sm md:text-base font-medium text-gray-900 dark:text-white mb-3">
        Connect dApp
      </h3>

      {/* Tab selector */}
      <div className="flex border border-gray-200 dark:border-zinc-600 rounded overflow-hidden mb-4">
        <button
          onClick={() => setActiveTab("qr")}
          className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors ${
            activeTab === "qr"
              ? "bg-blue-600 text-white"
              : "bg-gray-50 dark:bg-zinc-700 text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-600"
          }`}
        >
          Show QR
        </button>
        <button
          onClick={() => setActiveTab("paste")}
          className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors ${
            activeTab === "paste"
              ? "bg-blue-600 text-white"
              : "bg-gray-50 dark:bg-zinc-700 text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-600"
          }`}
        >
          Paste URI
        </button>
      </div>

      {/* Error display */}
      {error && (
        <div className="mb-3 p-2 bg-red-500/10 border border-red-500/30 rounded text-xs text-red-400">
          {error}
        </div>
      )}

      {/* QR Tab */}
      {activeTab === "qr" && (
        <div className="flex flex-col items-center">
          {isLoading ? (
            <div className="w-[220px] h-[220px] flex items-center justify-center bg-gray-50 dark:bg-zinc-700/50 rounded">
              <svg className="animate-spin w-6 h-6 text-gray-400" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>
          ) : qrSvg ? (
            // Safe: SVG is generated by generateQRCodeSVG() from a deterministic
            // QR encoding library — no user-controlled HTML enters the output.
            <div
              className="bg-white p-2 rounded"
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
          ) : (
            <div className="w-[220px] h-[220px] flex items-center justify-center bg-gray-50 dark:bg-zinc-700/50 rounded text-xs text-gray-400">
              Failed to generate QR
            </div>
          )}

          <p className="text-xs text-gray-500 dark:text-zinc-400 mt-3 text-center">
            Scan this QR code with a WalletConnect-compatible dApp
          </p>

          <button
            onClick={generatePairing}
            disabled={isLoading}
            className="mt-2 px-3 py-1 text-xs text-blue-500 hover:text-blue-400 transition-colors disabled:opacity-50"
          >
            Refresh QR
          </button>
        </div>
      )}

      {/* Paste URI Tab */}
      {activeTab === "paste" && (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-gray-500 dark:text-zinc-400">
            Copy the WalletConnect URI from the dApp and paste it below.
          </p>
          <textarea
            value={pasteUri}
            onChange={(e) => setPasteUri(e.target.value)}
            placeholder="wc:a1b2c3..."
            className="w-full px-3 py-2 bg-gray-100 dark:bg-zinc-700 border border-gray-300 dark:border-zinc-600 rounded text-gray-900 dark:text-white text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            rows={3}
            disabled={isLoading}
          />
          <button
            onClick={handlePasteConnect}
            disabled={isLoading || !pasteUri.trim()}
            className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-zinc-600 disabled:text-gray-500 dark:disabled:text-zinc-400 text-white font-medium rounded text-sm transition-colors"
          >
            {isLoading ? "Connecting..." : "Connect"}
          </button>
        </div>
      )}
    </div>
  );
}
