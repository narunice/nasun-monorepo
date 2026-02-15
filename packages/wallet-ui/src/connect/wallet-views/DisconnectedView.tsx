/**
 * Disconnected state: social login + create/import options.
 */

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
}: {
  handleSocialLogin: (provider: ZkLoginProvider) => void;
  isZkLoading: boolean;
  loadingProvider: ZkLoginProvider | null;
  zkError: { message: string } | null;
  setViewMode: (mode: ViewMode) => void;
  isPasskeySupported?: boolean;
  isPasskeyPlatformAvailable?: boolean | null;
  passkeyWallet?: PasskeyWalletState | null;
  onPasskeyUnlock?: () => Promise<void>;
  passkeyIsLoading?: boolean;
}) {
  const showPasskeySection = isPasskeySupported && isPasskeyPlatformAvailable;
  return (
    <div className="py-3 px-4 w-full ">
      {/* Quick Start Section - Social Login (Recommended) */}
      <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800">
        <div className="flex items-center justify-center gap-2 mb-2">
          <span className="text-sm xl:text-base font-medium text-blue-700 dark:text-blue-300">
            Quick Start
          </span>
          <span className="px-1.5 py-0.5 text-[10px] xl:text-xs font-medium bg-blue-600 text-white rounded">
            Recommended
          </span>
        </div>
        <p className="text-xs xl:text-sm text-blue-600 dark:text-blue-400 text-center mb-3">
          No seed phrase needed
        </p>
        <SocialLoginButtons
          onLogin={handleSocialLogin}
          isLoading={isZkLoading}
          loadingProvider={loadingProvider}
          providers={["google"]}
          size="md"
        />
        {zkError && <p className="text-xs xl:text-sm text-red-400 mt-2 text-center">{zkError.message}</p>}
      </div>

      {/* Biometric Wallet Section */}
      {showPasskeySection && (
        <div className="mb-4 space-y-1">
          <p className="text-[10px] xl:text-xs text-gray-400 dark:text-zinc-500 uppercase tracking-wider text-center mb-2">
            Biometric Wallet
          </p>
          {passkeyWallet ? (
            <button
              onClick={onPasskeyUnlock}
              disabled={passkeyIsLoading}
              className="w-full px-3 py-2.5 text-sm md:text-base text-gray-700 dark:text-zinc-200 bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4"
                />
              </svg>
              {passkeyIsLoading ? "Authenticating..." : "Unlock with Passkey"}
            </button>
          ) : (
            <button
              onClick={() => setViewMode("passkey-setup")}
              className="w-full px-3 py-2 text-left text-sm md:text-base text-gray-500 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-700 rounded transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4"
                />
              </svg>
              Setup Passkey Wallet
            </button>
          )}
        </div>
      )}

      {/* Traditional Wallet Options */}
      <div className="space-y-1">
        <p className="text-[10px] xl:text-xs text-gray-400 dark:text-zinc-500 uppercase tracking-wider text-center mb-2">
          Or use traditional wallet
        </p>
        <button
          onClick={() => setViewMode("create")}
          className="w-full px-3 py-2 text-left text-sm md:text-base text-gray-500 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-700 rounded transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          Create Password Wallet
        </button>
        <button
          onClick={() => setViewMode("import")}
          className="w-full px-3 py-2 text-left text-sm md:text-base text-gray-500 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-700 rounded transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
            />
          </svg>
          Import Existing Wallet
        </button>
      </div>
    </div>
  );
}
