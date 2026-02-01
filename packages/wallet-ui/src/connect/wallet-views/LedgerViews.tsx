/**
 * Ledger hardware wallet views: connect, select account, and connected state.
 */

import { type LedgerErrorCode, type LedgerConnectionStatus } from "@nasun/wallet";
import { CopyableAddress } from "../../address/CopyableAddress";
import { LedgerConnect, LedgerBrowserWarning, LedgerErrorDisplay } from "../../ledger";
import type { ViewMode } from "../LockedStateUI";

export function LedgerConnectView({
  ledgerStatus,
  ledgerError,
  ledgerConnect,
  setViewMode,
}: {
  ledgerStatus: LedgerConnectionStatus;
  ledgerError: { code: string; message: string } | null;
  ledgerConnect: () => Promise<void>;
  setViewMode: (mode: ViewMode) => void;
}) {
  const handleLedgerConnect = async () => {
    try {
      await ledgerConnect();
      setViewMode("main");
    } catch {
      // Error is handled by useLedger hook
    }
  };

  return (
    <div className="py-3 px-4 w-full ">
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => setViewMode("main")}
          className="p-1 hover:bg-gray-100 dark:hover:bg-zinc-700 rounded transition-colors"
        >
          <svg
            className="w-5 h-5 text-gray-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>
        <h3 className="text-sm md:text-base font-medium text-gray-900 dark:text-white">
          Add Hardware Key
        </h3>
      </div>

      <LedgerBrowserWarning />

      <div className="space-y-4">
        <div className="text-center py-4">
          <div className="text-4xl mb-3">🔐</div>
          <p className="text-sm md:text-base text-gray-600 dark:text-zinc-400 mb-1">
            Connect your Ledger device
          </p>
          <p className="text-xs md:text-sm text-gray-500 dark:text-zinc-500">
            Make sure the Sui/Nasun app is open on your device
          </p>
        </div>

        <LedgerConnect status={ledgerStatus} onConnect={handleLedgerConnect} variant="button" />

        {ledgerError && (
          <LedgerErrorDisplay
            code={ledgerError.code as LedgerErrorCode}
            rawMessage={ledgerError.message}
            onRetry={handleLedgerConnect}
          />
        )}
      </div>
    </div>
  );
}

export function LedgerSelectView({
  ledgerAccountIndex,
  setLedgerAccountIndex,
  ledgerAddress,
  setViewMode,
}: {
  ledgerAccountIndex: number;
  setLedgerAccountIndex: (idx: number) => void;
  ledgerAddress: string | null;
  setViewMode: (mode: ViewMode) => void;
}) {
  return (
    <div className="py-3 px-4 w-full ">
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => setViewMode("main")}
          className="p-1 hover:bg-gray-100 dark:hover:bg-zinc-700 rounded transition-colors"
        >
          <svg
            className="w-5 h-5 text-gray-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>
        <h3 className="text-sm md:text-base font-medium text-gray-900 dark:text-white">
          Select Account
        </h3>
      </div>

      <div className="space-y-2">
        <p className="text-xs md:text-sm text-gray-500 dark:text-zinc-400 mb-3">
          Choose which account index to use
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setLedgerAccountIndex(Math.max(0, ledgerAccountIndex - 1))}
            disabled={ledgerAccountIndex === 0}
            className="px-3 py-2 bg-gray-100 dark:bg-zinc-700 rounded hover:bg-gray-200 dark:hover:bg-zinc-600 disabled:opacity-50 transition-colors"
          >
            -
          </button>
          <div className="flex-1 text-center">
            <span className="text-lg font-medium text-gray-900 dark:text-white">
              Account {ledgerAccountIndex}
            </span>
          </div>
          <button
            onClick={() => setLedgerAccountIndex(ledgerAccountIndex + 1)}
            className="px-3 py-2 bg-gray-100 dark:bg-zinc-700 rounded hover:bg-gray-200 dark:hover:bg-zinc-600 transition-colors"
          >
            +
          </button>
        </div>
        {ledgerAddress && (
          <div className="mt-3 p-2 bg-gray-50 dark:bg-zinc-800 rounded text-xs text-gray-600 dark:text-zinc-400 break-all">
            {ledgerAddress}
          </div>
        )}
      </div>

      <div className="mt-4">
        <button
          onClick={() => setViewMode("main")}
          className="w-full px-3 py-2 text-sm md:text-base bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
        >
          Done
        </button>
      </div>
    </div>
  );
}

export function LedgerConnectedView({
  ledgerAddress,
  isMobile,
  setViewMode,
  ledgerDisconnect,
}: {
  ledgerAddress: string;
  isMobile: boolean;
  setViewMode: (mode: ViewMode) => void;
  ledgerDisconnect: () => Promise<void>;
}) {
  return (
    <div className="w-full ">
      {/* Ledger Address header */}
      <div className="px-3 py-3 border-b border-gray-200 dark:border-zinc-700">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-amber-500">🔐</span>
          <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
            Hardware Secured
          </span>
        </div>
        <CopyableAddress
          value={ledgerAddress}
          shorten={isMobile ? 4 : 6}
          showCopy
          showExplorer
          explorerType="address"
          size="xs"
        />
      </div>

      {/* Actions */}
      <div className="py-2 px-3 space-y-1">
        <button
          onClick={() => setViewMode("send")}
          className="w-full px-3 py-2 text-left text-sm md:text-base text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-700 rounded transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
            />
          </svg>
          Send
        </button>
        <button
          onClick={() => setViewMode("ledger-select")}
          className="w-full px-3 py-2 text-left text-sm md:text-base text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-700 rounded transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6h16M4 12h16m-7 6h7"
            />
          </svg>
          Change Account
        </button>
      </div>

      {/* Divider */}
      <div className="border-t border-gray-200 dark:border-zinc-700" />

      {/* Disconnect */}
      <div className="py-2 px-3">
        <button
          onClick={async () => {
            await ledgerDisconnect();
          }}
          className="w-full px-3 py-2 text-left text-sm md:text-base text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 border border-transparent hover:border-red-300 dark:hover:border-red-500/50 rounded transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
            />
          </svg>
          Disconnect Hardware Key
        </button>
      </div>
    </div>
  );
}
