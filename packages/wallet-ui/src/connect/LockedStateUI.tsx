/**
 * Locked state UI with rate limiting countdown
 */

import { useState, useEffect } from "react";
import {
  isLockedOut,
  getLockoutRemainingMs,
  getUnlockAttemptState,
  LOCKOUT_TIERS,
} from "@nasun/wallet";

import type { ViewMode } from "./types";
export type { ViewMode } from "./types";

export function LockedStateUI({
  password,
  setPassword,
  isLoading,
  error,
  handleUnlock,
  handleDelete,
  setViewMode,
  title = "Unlock Wallet",
}: {
  password: string;
  setPassword: (v: string) => void;
  isLoading: boolean;
  error: string | null;
  handleUnlock: () => void;
  handleDelete: () => void;
  setViewMode: (mode: ViewMode) => void;
  title?: string;
}) {
  const [lockoutRemaining, setLockoutRemaining] = useState(0);
  const [failedAttempts, setFailedAttempts] = useState(0);

  // Check lockout status and countdown
  useEffect(() => {
    const checkStatus = () => {
      const state = getUnlockAttemptState();
      setFailedAttempts(state.failedAttempts);

      if (isLockedOut()) {
        setLockoutRemaining(Math.ceil(getLockoutRemainingMs() / 1000));
      } else {
        setLockoutRemaining(0);
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 1000);
    return () => clearInterval(interval);
  }, []);

  const isLocked = lockoutRemaining > 0;

  // Calculate remaining attempts until first lockout
  const firstLockoutThreshold = LOCKOUT_TIERS[0]?.attempts ?? 8;
  const attemptsRemaining = Math.max(0, firstLockoutThreshold - failedAttempts);

  // Format remaining time for display
  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  return (
    <div className="p-4 w-full ">
      <h3 className="text-base md:text-lg xl:text-xl font-medium text-gray-900 dark:text-white mb-3">
        {title}
      </h3>

      {isLocked && (
        <div className="mb-3 p-2 bg-red-500/20 border border-red-500/50 rounded text-sm xl:text-base text-red-400">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <span>Too many failed attempts</span>
          </div>
          <div className="text-center mt-1 font-mono">
            Try again in {formatTime(lockoutRemaining)}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !isLocked && handleUnlock()}
          className="px-3 py-2 bg-gray-100 dark:bg-zinc-700 border border-gray-300 dark:border-zinc-600 rounded text-gray-900 dark:text-white text-sm xl:text-base focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={isLoading || isLocked}
          autoFocus={!isLocked}
        />

        {/* Error message with remaining attempts */}
        {error && !isLocked && (
          <div className="text-xs xl:text-sm">
            <p className="text-red-400">{error}</p>
            {failedAttempts > 0 && attemptsRemaining > 0 && (
              <p className="text-yellow-500 mt-1">
                {attemptsRemaining} attempt{attemptsRemaining !== 1 ? "s" : ""} remaining before
                lockout
              </p>
            )}
          </div>
        )}

        {/* Warning when approaching lockout */}
        {!error && !isLocked && failedAttempts > 0 && failedAttempts < firstLockoutThreshold && (
          <p className="text-xs xl:text-sm text-yellow-500">
            {attemptsRemaining} attempt{attemptsRemaining !== 1 ? "s" : ""} remaining before lockout
          </p>
        )}

        <div className="flex gap-2 mt-2">
          <button
            onClick={() => setViewMode("import")}
            className="px-3 py-2 text-sm xl:text-base text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors disabled:opacity-50"
            disabled={isLoading}
            title="Import a different wallet"
          >
            Import
          </button>
          <button
            onClick={handleDelete}
            className="px-3 py-2 text-sm xl:text-base text-red-600 dark:text-red-400 hover:text-red-500 dark:hover:text-red-300 transition-colors disabled:opacity-50"
            disabled={isLoading}
          >
            Delete
          </button>
          <button
            onClick={handleUnlock}
            disabled={isLoading || !password || isLocked}
            className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-600 disabled:text-zinc-400 text-white font-medium rounded text-sm xl:text-base transition-colors"
          >
            {isLocked
              ? `Locked (${formatTime(lockoutRemaining)})`
              : isLoading
                ? "Unlocking..."
                : "Unlock"}
          </button>
        </div>
      </div>
    </div>
  );
}
