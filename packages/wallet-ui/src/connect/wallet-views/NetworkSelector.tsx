/**
 * Shared network selector for connected wallet views.
 * Shows clickable chain selector in advanced mode, read-only badge otherwise.
 */

import { useState, useRef, useEffect } from "react";
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
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Close tooltip on outside click
  useEffect(() => {
    if (!showTooltip) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(e.target as Node)) {
        setShowTooltip(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showTooltip]);

  return (
    <div className="flex-shrink-0 flex flex-col items-center gap-2">
      {isAdvancedMode ? (
        <button
          onClick={onOpenModal}
          className="flex items-center gap-1.5 px-2 py-1 text-xs xl:text-sm font-medium rounded-md
            bg-white dark:bg-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-700
            text-gray-700 dark:text-zinc-300 transition-colors shadow-sm"
        >
          <span className="max-w-[100px] truncate">{chain.name}</span>
          {chain.type === "evm" && (
            <span className="text-[10px] xl:text-xs text-purple-500 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/30 px-1 rounded">
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
        <div className="relative" ref={tooltipRef}>
          <div
            className="flex items-center gap-1.5 px-2 py-1 text-xs xl:text-sm font-medium rounded-md
            bg-white dark:bg-zinc-800 text-gray-500 dark:text-zinc-400 cursor-default shadow-sm"
          >
            <span className="max-w-[100px] truncate">{chain.name}</span>
            <svg
              className="w-3.5 h-3.5 text-gray-400 cursor-pointer hover:text-gray-500 dark:hover:text-gray-300 transition-colors"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              onClick={(e) => { e.stopPropagation(); setShowTooltip(!showTooltip); }}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          {showTooltip && (
            <div
              className="absolute right-0 top-full mt-1 w-48 p-2 text-xs xl:text-sm text-gray-600 dark:text-zinc-300
              bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-600 rounded-lg shadow-lg z-50"
            >
              Enable Pro Mode in Settings to change network
            </div>
          )}
        </div>
      )}
      <AdvancedToggle compact showDescription={false} />
    </div>
  );
}
