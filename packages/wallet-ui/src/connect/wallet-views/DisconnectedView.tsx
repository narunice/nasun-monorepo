/**
 * Disconnected state: social login + create/import options.
 */

import { type ZkLoginProvider } from "@nasun/wallet";
import { SocialLoginButtons } from "../../social/SocialLoginButtons";
import type { ViewMode } from "../types";

export function DisconnectedView({
  handleSocialLogin,
  isZkLoading,
  loadingProvider,
  zkError,
  setViewMode,
}: {
  handleSocialLogin: (provider: ZkLoginProvider) => void;
  isZkLoading: boolean;
  loadingProvider: ZkLoginProvider | null;
  zkError: { message: string } | null;
  setViewMode: (mode: ViewMode) => void;
}) {
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
