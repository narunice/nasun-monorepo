/**
 * Quick action buttons: Send / Recv / Stake / More
 */

import React from "react";

const QUICK_ACTIONS = [
  { key: "send", label: "Send", path: "M12 19l9 2-9-18-9 18 9-2zm0 0v-8" },
  {
    key: "receive",
    label: "Recv",
    path: "M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z",
  },
  {
    key: "staking",
    label: "Stake",
    path: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  },
] as const;

export function QuickActionsBar({
  onAction,
  showMoreMenu,
  onToggleMore,
  moreMenuContent,
}: {
  onAction: (action: string) => void;
  showMoreMenu: boolean;
  onToggleMore: () => void;
  moreMenuContent: React.ReactNode;
}) {
  return (
    <div className="px-2 py-1 flex gap-2 bg-gray-100 dark:bg-zinc-700/50">
      {QUICK_ACTIONS.map(({ key, label, path }) => (
        <button
          key={key}
          onClick={() => onAction(key)}
          className="flex-1 flex flex-col items-center justify-center gap-1 py-2 rounded-lg text-[11px] font-medium transition-all text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-300 bg-white dark:bg-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-700"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={path} />
          </svg>
          {label}
        </button>
      ))}
      <div className="relative flex-1">
        <button
          onClick={onToggleMore}
          className={`w-full flex flex-col items-center justify-center gap-1 py-2 rounded-lg text-[11px] font-medium transition-all ${
            showMoreMenu
              ? "bg-white dark:bg-zinc-700 shadow-sm text-gray-900 dark:text-white"
              : "text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-300 bg-white dark:bg-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-700"
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z"
            />
          </svg>
          More
        </button>
        {showMoreMenu && (
          <div className="absolute right-0 bottom-full mb-1 w-48 bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg shadow-lg z-50">
            {moreMenuContent}
          </div>
        )}
      </div>
    </div>
  );
}
