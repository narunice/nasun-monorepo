/**
 * Disconnected state: social login + create/import options.
 */

import { useState } from "react";
import { type ZkLoginProvider, type PasskeyWalletState } from "@nasun/wallet";
import { SocialLoginButtons } from "../../social/SocialLoginButtons";
import type { ViewMode } from "../types";

export function DisconnectedView({
  handleSocialLogin,
  isZkLoading,
  loadingProvider,
  zkError,
  setViewMode,
  isPasskeySupported,
  isPasskeyPlatformAvailable,
  passkeyWallet,
  onPasskeyUnlock,
  passkeyIsLoading,
  passkeyNeedsPassword,
}: {
  handleSocialLogin: (provider: ZkLoginProvider) => void;
  isZkLoading: boolean;
  loadingProvider: ZkLoginProvider | null;
  zkError: { message: string } | null;
  setViewMode: (mode: ViewMode) => void;
  isPasskeySupported?: boolean;
  isPasskeyPlatformAvailable?: boolean | null;
  passkeyWallet?: PasskeyWalletState | null;
  onPasskeyUnlock?: (password?: string) => Promise<void>;
  passkeyIsLoading?: boolean;
  passkeyNeedsPassword?: boolean;
}) {
  const [passkeyPassword, setPasskeyPassword] = useState("");
  const showPasskeySection = isPasskeySupported && isPasskeyPlatformAvailable;
  return (
    <div className="py-3 px-4 w-full">
      {/* Social Login */}
      <SocialLoginButtons
        onLogin={handleSocialLogin}
        isLoading={isZkLoading}
        loadingProvider={loadingProvider}
        providers={["google"]}
        size="md"
      />
      {zkError && <p className="text-xs xl:text-sm text-red-400 mt-2 text-center">{zkError.message}</p>}

      {/* Passkey Section — styled to match Google button (h-11, font-medium, border-gray, w-5 icon) */}
      {showPasskeySection && (
        <div className="mt-3">
          {passkeyWallet ? (
            <div className="space-y-2">
              {passkeyNeedsPassword && (
                <input
                  type="password"
                  placeholder="Wallet password"
                  value={passkeyPassword}
                  onChange={(e) => setPasskeyPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && passkeyPassword && onPasskeyUnlock?.(passkeyPassword)}
                  className="w-full px-3 py-2 bg-gray-100 dark:bg-zinc-700 border border-gray-300 dark:border-zinc-600 rounded text-gray-900 dark:text-white text-sm xl:text-base focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  disabled={passkeyIsLoading}
                />
              )}
              <button
                onClick={() => onPasskeyUnlock?.(passkeyNeedsPassword ? passkeyPassword : undefined)}
                disabled={passkeyIsLoading || (passkeyNeedsPassword && !passkeyPassword)}
                className="flex items-center justify-center gap-3 w-full h-11 rounded-lg border border-gray-200 dark:border-zinc-700 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed bg-white dark:bg-zinc-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-zinc-700 text-base xl:text-lg px-4"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4"
                  />
                </svg>
                {passkeyIsLoading ? "Authenticating..." : "Unlock with Passkey"}
              </button>
            </div>
          ) : (
            <button
              onClick={() => setViewMode("passkey-setup")}
              className="flex items-center justify-center gap-3 w-full h-11 rounded-lg border border-gray-200 dark:border-zinc-700 transition-all duration-200 bg-white dark:bg-zinc-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-zinc-700 text-base xl:text-lg px-4"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4"
                />
              </svg>
              Use Passkey
            </button>
          )}
        </div>
      )}

      {/* Divider */}
      <div className="flex items-center gap-3 my-3">
        <div className="flex-1 border-t border-gray-200 dark:border-zinc-700" />
        <span className="text-xs text-gray-400 dark:text-zinc-500 whitespace-nowrap">or use web3 native wallet</span>
        <div className="flex-1 border-t border-gray-200 dark:border-zinc-700" />
      </div>

      {/* Traditional Wallet Options — 3-column icon + label grid */}
      <div className="grid grid-cols-3 gap-2">
        <button
          onClick={() => setViewMode("create")}
          className="flex flex-col items-center justify-center gap-1.5 py-3 rounded-lg text-gray-500 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          <span className="text-xs">Create</span>
        </button>
        <button
          onClick={() => setViewMode("import")}
          className="flex flex-col items-center justify-center gap-1.5 py-3 rounded-lg text-gray-500 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
            />
          </svg>
          <span className="text-xs">Import</span>
        </button>
        <button
          onClick={() => setViewMode("restore-backup")}
          className="flex flex-col items-center justify-center gap-1.5 py-3 rounded-lg text-gray-500 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          <span className="text-xs">Restore</span>
        </button>
      </div>
    </div>
  );
}
