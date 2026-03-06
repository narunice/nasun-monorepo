/**
 * AssetsTab Component
 *
 * Combined view of Tokens and NFTs in a single scrollable tab.
 * Replaces the separate tokens/nfts tabs from the original design.
 */

import { useState } from "react";
import {
  useMultiBalance,
  useBalance,
  useNetwork,
  useChain,
  useEVMBalance,
  getStoredEVMAddress,
  getAllTokens,
  type NFTInfo,
  type NFTSortBy,
} from "@nasun/wallet";

// Convert null to undefined for hook parameter compatibility
const nullToUndefined = <T,>(value: T | null): T | undefined =>
  value === null ? undefined : value;
import { NFTCard } from "../nft/NFTCard";
import { TokenFaucetButton } from "./TokenFaucetButton";

interface AssetsTabProps {
  /** Wallet address */
  address: string;
  /** List of NFTs */
  nfts: NFTInfo[];
  /** Whether NFTs are loading */
  nftsLoading: boolean;
  /** Whether there are more NFTs to load */
  nftsHasNextPage: boolean;
  /** Callback to load more NFTs */
  onLoadMoreNfts: () => void;
  /** Callback when NFT is clicked */
  onNftClick: (nft: NFTInfo) => void;
  /** NFT sort order */
  nftSortBy: NFTSortBy;
  /** Callback to change sort order */
  onNftSortChange: (sortBy: NFTSortBy) => void;
}

export function AssetsTab({
  address,
  nfts,
  nftsLoading,
  nftsHasNextPage,
  onLoadMoreNfts,
  onNftClick,
  nftSortBy,
  onNftSortChange,
}: AssetsTabProps) {
  const [showNfts, setShowNfts] = useState(true);
  const { data: balances, isLoading: balancesLoading } = useMultiBalance({ address });
  const { networkType } = useNetwork();
  const { chain, isEVM, isExternalMove } = useChain();
  const storedEVMAddress = getStoredEVMAddress();
  const { balance: evmBalance, isLoading: evmBalanceLoading } = useEVMBalance(
    isEVM ? nullToUndefined(storedEVMAddress) : undefined
  );
  const { data: moveNativeBalance, isLoading: moveNativeLoading } = useBalance(undefined, {
    enabled: isExternalMove,
  });

  return (
    <div>
      {/* Token Balances Section */}
      <div className="px-3 py-2 border-b border-gray-200 dark:border-zinc-700">
        <p className="text-xs xl:text-sm font-medium text-gray-500 dark:text-zinc-400 mb-2">
          Tokens {(isEVM || isExternalMove) && `(${chain.name})`}
        </p>
        {isEVM ? (
          // EVM chain balance display
          <div className="space-y-1.5">
            {!storedEVMAddress ? (
              <p className="text-sm xl:text-base text-gray-500 dark:text-zinc-400">
                EVM wallet not configured
              </p>
            ) : evmBalanceLoading ? (
              <div className="h-5 bg-gray-200 dark:bg-zinc-700 rounded animate-pulse" />
            ) : (
              <div className="flex items-center justify-between text-sm xl:text-base">
                <span className="text-gray-700 dark:text-zinc-300">
                  {chain.nativeCurrency.symbol}
                </span>
                <span className="font-mono text-gray-900 dark:text-white">
                  {evmBalance?.display || "0"}
                </span>
              </div>
            )}
          </div>
        ) : isExternalMove ? (
          // External Move chain: native token only (SUI, IOTA)
          <div className="space-y-1.5">
            {moveNativeLoading ? (
              <div className="h-5 bg-gray-200 dark:bg-zinc-700 rounded animate-pulse" />
            ) : (
              <div className="flex items-center justify-between text-sm xl:text-base">
                <span className="text-gray-700 dark:text-zinc-300">
                  {chain.nativeCurrency.symbol}
                </span>
                <span className="font-mono text-gray-900 dark:text-white">
                  {moveNativeBalance?.formattedBalance || "0"}
                </span>
              </div>
            )}
          </div>
        ) : balancesLoading ? (
          <div className="space-y-1.5">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="h-5 bg-gray-200 dark:bg-zinc-700 rounded animate-pulse"
              />
            ))}
          </div>
        ) : (
          <div className="space-y-1.5">
            {/* Native token (NSN) */}
            <div className="flex items-center justify-between text-sm xl:text-base">
              <span className="text-gray-700 dark:text-zinc-300">NSN</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-gray-900 dark:text-white">
                  {balances?.native?.formatted || "0"}
                </span>
                <TokenFaucetButton symbol="NSN" compact />
              </div>
            </div>
            {/* Additional tokens */}
            {(networkType === "mainnet"
              ? Object.entries(balances?.tokens || {})
              : getAllTokens()
                  .filter((t) => t.symbol !== "NSN")
                  .map(
                    (t) =>
                      [
                        t.symbol,
                        balances?.tokens?.[t.symbol] || { formatted: "0" },
                      ] as const
                  )
            ).map(([symbol, token]) => (
              <div key={symbol} className="flex items-center justify-between text-sm xl:text-base">
                <span className="text-gray-700 dark:text-zinc-300">{symbol}</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-gray-900 dark:text-white">
                    {token.formatted}
                  </span>
                  <TokenFaucetButton symbol={symbol} compact />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* NFTs Section - Collapsible (Nasun chains only) */}
      {!isEVM && !isExternalMove && <div className="px-3 py-2">
        <button
          onClick={() => setShowNfts(!showNfts)}
          className="w-full flex items-center justify-between text-xs xl:text-sm font-medium text-gray-500 dark:text-zinc-400 mb-2"
        >
          <span>
            NFTs {nfts.length > 0 && `(${nfts.length})`}
          </span>
          <svg
            className={`w-4 h-4 transition-transform ${showNfts ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showNfts && (
          <>
            {nftsLoading && nfts.length === 0 ? (
              <div className="grid grid-cols-3 gap-2">
                {[...Array(6)].map((_, i) => (
                  <div
                    key={i}
                    className="aspect-square bg-gray-200 dark:bg-zinc-700 rounded animate-pulse"
                  />
                ))}
              </div>
            ) : nfts.length === 0 ? (
              <div className="text-center py-4">
                <svg
                  className="w-8 h-8 text-gray-400 dark:text-zinc-500 mx-auto mb-1"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
                <p className="text-xs xl:text-sm text-gray-500 dark:text-zinc-400">No NFTs found</p>
              </div>
            ) : (
              <>
                {/* Sort dropdown */}
                <div className="flex justify-end mb-2">
                  <select
                    value={nftSortBy}
                    onChange={(e) => onNftSortChange(e.target.value as NFTSortBy)}
                    className="text-xs xl:text-sm px-2 py-1 bg-transparent border border-gray-200 dark:border-zinc-600 rounded text-gray-600 dark:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="newest">Newest</option>
                    <option value="oldest">Oldest</option>
                    <option value="name_asc">Name A-Z</option>
                    <option value="name_desc">Name Z-A</option>
                  </select>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {nfts.map((nft) => (
                    <NFTCard key={nft.objectId} nft={nft} compact onClick={onNftClick} />
                  ))}
                </div>
                {/* Load More button */}
                {nftsHasNextPage && (
                  <button
                    onClick={onLoadMoreNfts}
                    disabled={nftsLoading}
                    className="w-full mt-2 py-1.5 text-xs xl:text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors disabled:opacity-50"
                  >
                    {nftsLoading ? "Loading..." : "Load More"}
                  </button>
                )}
              </>
            )}
          </>
        )}
      </div>}
    </div>
  );
}
