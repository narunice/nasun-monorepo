/**
 * NFT Gallery Component
 * Grid display of NFTs owned by the connected wallet
 */

import { useState } from 'react';
import { useNFTs, type NFTInfo } from '@nasun/wallet';
import { NFTCard } from './NFTCard';
import { NFTDetail } from './NFTDetail';

interface NFTGalleryProps {
  /** Number of columns in the grid */
  columns?: 2 | 3 | 4;
  /** Compact mode for smaller displays */
  compact?: boolean;
  /** Maximum number of NFTs to show (0 = unlimited) */
  limit?: number;
  /** Custom empty state message */
  emptyMessage?: string;
  /** Hide header */
  hideHeader?: boolean;
  /** Custom class name */
  className?: string;
  /** Auto-refresh interval in milliseconds (default: 30000 = 30 seconds) */
  refetchInterval?: number;
}

export function NFTGallery({
  columns = 4,
  compact = false,
  limit = 0,
  emptyMessage = 'No NFTs found',
  hideHeader = false,
  className = '',
  refetchInterval = 30000,
}: NFTGalleryProps) {
  const { data: nfts, isLoading, error, refetch } = useNFTs({
    limit: limit || 50,
    refetchInterval,
  });
  const [selectedNFT, setSelectedNFT] = useState<NFTInfo | null>(null);

  // Grid column classes
  const gridClasses = {
    2: 'grid-cols-2',
    3: 'grid-cols-3',
    4: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4',
  };

  // Loading state
  if (isLoading) {
    return (
      <div className={`${className}`}>
        {!hideHeader && (
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">My NFTs</h3>
          </div>
        )}
        <div className={`grid ${gridClasses[columns]} gap-3`}>
          {[...Array(compact ? 3 : 8)].map((_, i) => (
            <div
              key={i}
              className="bg-white dark:bg-zinc-800 rounded-lg overflow-hidden animate-pulse"
            >
              <div className="aspect-square bg-gray-100 dark:bg-zinc-700" />
              <div className="p-3">
                <div className="h-4 bg-gray-100 dark:bg-zinc-700 rounded w-3/4" />
                <div className="h-3 bg-gray-100 dark:bg-zinc-700 rounded w-1/2 mt-2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={`${className}`}>
        {!hideHeader && (
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">My NFTs</h3>
          </div>
        )}
        <div className="bg-red-100 dark:bg-red-500/10 border border-red-300 dark:border-red-500/30 rounded-lg p-4">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          <button
            onClick={() => refetch()}
            className="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  // Limit displayed NFTs if needed
  const displayedNFTs = limit > 0 ? nfts.slice(0, limit) : nfts;

  // Empty state
  if (displayedNFTs.length === 0) {
    return (
      <div className={`${className}`}>
        {!hideHeader && (
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">My NFTs</h3>
          </div>
        )}
        <div className="bg-gray-50 dark:bg-zinc-800 rounded-lg p-6 text-center">
          <svg
            className="w-12 h-12 text-gray-400 dark:text-zinc-600 mx-auto mb-3"
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
          <p className="text-gray-500 dark:text-zinc-400 text-sm">{emptyMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`${className}`}>
      {!hideHeader && (
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">
            My NFTs ({nfts.length})
          </h3>
          <button
            onClick={() => refetch()}
            className="text-sm text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            title="Refresh"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
        </div>
      )}

      {/* NFT Grid */}
      <div className={`grid ${gridClasses[columns]} gap-3`}>
        {displayedNFTs.map((nft) => (
          <NFTCard
            key={nft.objectId}
            nft={nft}
            compact={compact}
            onClick={setSelectedNFT}
          />
        ))}
      </div>

      {/* Show more indicator */}
      {limit > 0 && nfts.length > limit && (
        <p className="text-center text-sm text-gray-500 dark:text-zinc-400 mt-3">
          +{nfts.length - limit} more
        </p>
      )}

      {/* NFT Detail Modal */}
      {selectedNFT && (
        <NFTDetail
          nft={selectedNFT}
          onClose={() => setSelectedNFT(null)}
        />
      )}
    </div>
  );
}
