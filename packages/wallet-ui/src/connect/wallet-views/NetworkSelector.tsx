/**
 * Shared network selector for connected wallet views.
 * Shows clickable chain selector in advanced mode, read-only badge otherwise.
 */

import { AdvancedToggle } from "../../advanced/AdvancedToggle";

export function NetworkSelector({
  isAdvancedMode,
  chain,
  onOpenModal,
}: {
  isAdvancedMode: boolean;
  chain: { name: string; type: string };
  onOpenModal: () => void;
}) {
  return (
    <div className="flex-shrink-0 flex flex-col items-center gap-2">
      {isAdvancedMode ? (
        <button
          onClick={onOpenModal}
          className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded-md
            bg-white dark:bg-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-700
            text-gray-700 dark:text-zinc-300 transition-colors shadow-sm"
        >
          <span className="max-w-[100px] truncate">{chain.name}</span>
          {chain.type === "evm" && (
            <span className="text-[10px] text-purple-500 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/30 px-1 rounded">
              EVM
            </span>
          )}
          <svg
            className="w-3 h-3 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>
      ) : (
        <div className="group relative">
          <div
            className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded-md
            bg-white dark:bg-zinc-800 text-gray-500 dark:text-zinc-400 cursor-default shadow-sm"
          >
            <span className="max-w-[100px] truncate">{chain.name}</span>
            <svg
              className="w-3 h-3 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          {/* Tooltip */}
          <div
            className="absolute right-0 top-full mt-1 w-48 p-2 text-xs text-gray-600 dark:text-zinc-300
            bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-600 rounded-lg shadow-lg
            opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50"
          >
            Enable Pro Mode in Settings to change network
          </div>
        </div>
      )}
      <AdvancedToggle compact showDescription={false} />
    </div>
  );
}
