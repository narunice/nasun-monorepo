/**
 * Shared assets tab content: token balances + NFT preview.
 * Used by both zkLogin and self-custody connected views.
 *
 * Three display modes:
 * - EVM chains: native token + ERC-20 tokens
 * - External Move chains (Sui/IOTA): native token only (SUI, IOTA)
 * - Nasun chains: NSN + registered tokens + Faucet buttons + NFTs
 */

import { type NFTInfo, type ERC20Balance } from "@nasun/wallet";
import { NFTCard } from "../../nft/NFTCard";
import { TokenFaucetButton } from "../../balance/TokenFaucetButton";

/** Format ERC-20 balance for display (max 6 decimals) */
function formatERC20Display(balance: ERC20Balance): string {
  const num = parseFloat(balance.formattedBalance);
  if (num === 0) return "0.000000";
  const displayDecimals = Math.min(6, balance.decimals);
  return num.toFixed(displayDecimals);
}

export function AssetsTabContent({
  isEVM,
  isExternalMove,
  chain,
  storedEVMAddress,
  evmBalance,
  evmBalanceLoading,
  erc20Balances,
  erc20Loading,
  onAddToken,
  moveNativeBalance,
  moveNativeLoading,
  balances,
  balancesLoading,
  networkType,
  getAllTokens,
  accumulatedNfts,
  nftsLoading,
  onSelectNFT,
}: {
  isEVM: boolean;
  isExternalMove: boolean;
  chain: { name: string; nativeCurrency: { symbol: string } };
  storedEVMAddress: string | null;
  evmBalance: { display: string } | null | undefined;
  evmBalanceLoading: boolean;
  erc20Balances: ERC20Balance[];
  erc20Loading: boolean;
  onAddToken?: () => void;
  moveNativeBalance: { formattedBalance: string } | undefined;
  moveNativeLoading: boolean;
  balances: { native?: { formatted: string }; tokens?: Record<string, { formatted: string }> } | undefined;
  balancesLoading: boolean;
  networkType: string;
  getAllTokens: () => { symbol: string }[];
  accumulatedNfts: NFTInfo[];
  nftsLoading: boolean;
  onSelectNFT: (nft: NFTInfo) => void;
}) {
  return (
    <div className="py-1 mx-2 bg-white dark:bg-zinc-800 rounded-b-lg rounded-tr-lg">
      {/* Token Balances Section */}
      <div className="px-3 py-2 border-b border-gray-200 dark:border-zinc-700">
        <p className="text-xs md:text-sm xl:text-base font-medium text-gray-500 dark:text-zinc-400 mb-2">
          Token Balances {(isEVM || isExternalMove) && `(${chain.name})`}
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
              <>
                {/* Native token (ETH, MATIC, etc.) */}
                <div className="flex items-center justify-between text-sm xl:text-base">
                  <span className="text-gray-700 dark:text-zinc-300">
                    {chain.nativeCurrency.symbol}
                  </span>
                  <span className="font-mono text-gray-900 dark:text-white">
                    {evmBalance?.display || "0"}
                  </span>
                </div>

                {/* ERC-20 tokens */}
                {erc20Loading ? (
                  <div className="h-5 bg-gray-200 dark:bg-zinc-700 rounded animate-pulse" />
                ) : (
                  erc20Balances.map((token) => (
                    <div key={token.address} className="flex items-center justify-between text-sm xl:text-base">
                      <span className="text-gray-700 dark:text-zinc-300">{token.symbol}</span>
                      <span className="font-mono text-gray-900 dark:text-white">
                        {formatERC20Display(token)}
                      </span>
                    </div>
                  ))
                )}

                {/* Add Token button */}
                {onAddToken && (
                  <button
                    onClick={onAddToken}
                    className="w-full mt-1 py-1 text-xs xl:text-sm text-gray-400 dark:text-zinc-500 hover:text-gray-600 dark:hover:text-zinc-300 transition-colors"
                  >
                    + Add Token
                  </button>
                )}
              </>
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
            {/* Additional tokens - show all registered on devnet/testnet, only with balance on mainnet */}
            {(networkType === "mainnet"
              ? Object.entries(balances?.tokens || {})
              : getAllTokens()
                  .filter((t) => t.symbol !== "NSN")
                  .map(
                    (t) =>
                      [
                        t.symbol,
                        balances?.tokens?.[t.symbol] || { formatted: "0" },
                      ] as const,
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

      {/* NFT Preview Section - only on Nasun chains */}
      {!isEVM && !isExternalMove && (
        <div className="px-3 py-2">
          <p className="text-xs md:text-sm xl:text-base font-medium text-gray-500 dark:text-zinc-400 mb-2">
            NFTs {accumulatedNfts.length > 0 && `(${accumulatedNfts.length})`}
          </p>
          {nftsLoading && accumulatedNfts.length === 0 ? (
            <div className="grid grid-cols-3 gap-2">
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className="aspect-square bg-gray-200 dark:bg-zinc-700 rounded animate-pulse"
                />
              ))}
            </div>
          ) : accumulatedNfts.length === 0 ? (
            <p className="text-xs xl:text-sm text-gray-400 dark:text-zinc-500 text-center py-4">
              No NFTs found
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {accumulatedNfts.slice(0, 6).map((nft) => (
                <NFTCard
                  key={nft.objectId}
                  nft={nft}
                  compact
                  onClick={(n) => onSelectNFT(n)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
