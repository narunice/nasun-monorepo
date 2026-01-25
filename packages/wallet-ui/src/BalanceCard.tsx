/**
 * BalanceCard Component
 *
 * Compact balance display with inline action buttons (Send, Receive, More)
 * Used in the new wallet UI structure to reduce vertical space.
 */

import { useState } from "react";
import {
  useMultiBalance,
  useNetwork,
  useChain,
  useEVMBalance,
  getStoredEVMAddress,
} from "@nasun/wallet";

interface BalanceCardProps {
  /** Wallet address to display balance for */
  address: string;
  /** Callback when Send button is clicked */
  onSend: () => void;
  /** Callback when Receive button is clicked */
  onReceive: () => void;
  /** Callback when More button is clicked */
  onMore: () => void;
  /** Whether More menu is currently open */
  moreMenuOpen?: boolean;
}

export function BalanceCard({
  address,
  onSend,
  onReceive,
  onMore,
  moreMenuOpen = false,
}: BalanceCardProps) {
  const { data: balances, isLoading: balancesLoading } = useMultiBalance(address);
  const { networkType, isEVM } = useNetwork();
  const { chain } = useChain();
  const storedEVMAddress = getStoredEVMAddress();
  const { data: evmBalance, isLoading: evmBalanceLoading } = useEVMBalance(
    isEVM ? storedEVMAddress : undefined
  );

  const isLoading = isEVM ? evmBalanceLoading : balancesLoading;

  // Get primary balance display
  const getPrimaryBalance = () => {
    if (isEVM) {
      return {
        symbol: chain.nativeCurrency.symbol,
        amount: evmBalance?.display || "0",
      };
    }
    return {
      symbol: "NSN",
      amount: balances?.native?.formatted || "0",
    };
  };

  const primaryBalance = getPrimaryBalance();

  return (
    <div className="px-3 py-3 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-zinc-800 dark:to-zinc-900 border-b border-gray-200 dark:border-zinc-700">
      {/* Balance Display */}
      <div className="mb-3">
        {isLoading ? (
          <div className="h-8 w-32 bg-gray-200 dark:bg-zinc-700 rounded animate-pulse" />
        ) : (
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-gray-900 dark:text-white">
              {primaryBalance.amount}
            </span>
            <span className="text-sm text-gray-500 dark:text-zinc-400">
              {primaryBalance.symbol}
            </span>
          </div>
        )}
        {isEVM && (
          <p className="text-xs text-gray-500 dark:text-zinc-500 mt-0.5">
            on {chain.name}
          </p>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2">
        <button
          onClick={onSend}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
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
          onClick={onReceive}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-gray-200 dark:bg-zinc-700 hover:bg-gray-300 dark:hover:bg-zinc-600 text-gray-700 dark:text-zinc-300 text-sm font-medium rounded-lg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
            />
          </svg>
          Receive
        </button>
        <button
          onClick={onMore}
          className={`flex items-center justify-center gap-1 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
            moreMenuOpen
              ? "bg-gray-300 dark:bg-zinc-600 text-gray-900 dark:text-white"
              : "bg-gray-200 dark:bg-zinc-700 hover:bg-gray-300 dark:hover:bg-zinc-600 text-gray-700 dark:text-zinc-300"
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
          <svg
            className={`w-3 h-3 transition-transform ${moreMenuOpen ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>
    </div>
  );
}
