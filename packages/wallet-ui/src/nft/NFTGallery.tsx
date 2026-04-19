/**
 * NFT Gallery Component
 * Grid display of NFTs owned by the connected wallet
 */

import { useState, useMemo } from 'react';
import { useNFTs, DEFAULT_NFT_SORT, type NFTInfo, type NFTSortBy } from '@nasun/wallet';
import { NFTCard } from './NFTCard';
import { NFTDetail } from './NFTDetail';

/** Sort option labels for dropdown */
const SORT_OPTIONS: { value: NFTSortBy; label: string }[] = [
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'name_asc', label: 'Name A-Z' },
  { value: 'name_desc', label: 'Name Z-A' },
];

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
  /** Hide sort dropdown */
  hideSort?: boolean;
  /** Custom class name */
  className?: string;
  /** Auto-refresh interval in milliseconds (default: 30000 = 30 seconds) */
  refetchInterval?: number;
  /** Initial sort order */
  defaultSortBy?: NFTSortBy;
}

const GALLERY_PAGE_SIZE = 12;

export function NFTGallery({
  columns = 4,
  compact = false,
  limit = 0,
  emptyMessage = 'No NFTs found',
  hideHeader = false,
  hideSort = false,
  className = '',
  refetchInterval = 30000,
  defaultSortBy = DEFAULT_NFT_SORT,
}: NFTGalleryProps) {
  const [sortBy, setSortBy] = useState<NFTSortBy>(defaultSortBy);
  const [galleryPage, setGalleryPage] = useState(1);
  const { data: nfts, isLoading, error, refetch } = useNFTs({
    refetchInterval,
    sortBy,
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
            <h3 className="text-lg xl:text-xl font-medium text-gray-900 dark:text-white">My NFTs</h3>
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
            <h3 className="text-lg xl:text-xl font-medium text-gray-900 dark:text-white">My NFTs</h3>
          </div>
        )}
        <div className="bg-red-100 dark:bg-red-500/10 border border-red-300 dark:border-red-500/30 rounded-lg p-4">
          <p className="text-sm xl:text-base text-red-600 dark:text-red-400">{error}</p>
          <button
            onClick={() => refetch()}
            className="mt-2 text-sm xl:text-base text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  const displayedNFTs = useMemo(() => {
    if (limit > 0) return nfts.slice(0, limit);
    const start = (galleryPage - 1) * GALLERY_PAGE_SIZE;
    return nfts.slice(start, start + GALLERY_PAGE_SIZE);
  }, [nfts, limit, galleryPage]);

  const totalPages = limit > 0 ? 1 : Math.ceil(nfts.length / GALLERY_PAGE_SIZE);

  // Empty state
  if (displayedNFTs.length === 0) {
    return (
      <div className={`${className}`}>
        {!hideHeader && (
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg xl:text-xl font-medium text-gray-900 dark:text-white">My NFTs</h3>
          </div>
        )}
        <div className="bg-gray-50 dark:bg-zinc-800 rounded-lg p-6 text-center">
          <svg
            className="w-12 h-12 text-gray-400 dark:text-zinc-500 mx-auto mb-3"
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
          <p className="text-gray-500 dark:text-zinc-400 text-sm xl:text-base">{emptyMessage}</p>
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
          <div className="flex items-center gap-2">
            {/* Sort dropdown */}
            {!hideSort && nfts.length > 1 && (
              <select
                value={sortBy}
                onChange={(e) => { setSortBy(e.target.value as NFTSortBy); setGalleryPage(1); }}
                className="text-xs xl:text-sm px-2 py-1 bg-gray-100 dark:bg-zinc-700 border border-gray-200 dark:border-zinc-600 rounded text-gray-700 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            )}
            {/* Refresh button */}
            <button
              onClick={() => refetch()}
              className="text-sm md:text-base text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors"
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

      {/* Show more indicator (preview mode) */}
      {limit > 0 && nfts.length > limit && (
        <p className="text-center text-sm md:text-base text-gray-500 dark:text-zinc-400 mt-3">
          +{nfts.length - limit} more
        </p>
      )}

      {/* Pagination (full gallery mode) */}
      {limit === 0 && totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            onClick={() => setGalleryPage(p => Math.max(1, p - 1))}
            disabled={galleryPage === 1}
            className="px-3 py-1.5 text-sm rounded border border-gray-200 dark:border-zinc-600 disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-zinc-700 text-gray-700 dark:text-zinc-300 transition-colors"
          >
            Prev
          </button>
          <span className="text-sm text-gray-500 dark:text-zinc-400">
            {galleryPage} / {totalPages}
          </span>
          <button
            onClick={() => setGalleryPage(p => Math.min(totalPages, p + 1))}
            disabled={galleryPage === totalPages}
            className="px-3 py-1.5 text-sm rounded border border-gray-200 dark:border-zinc-600 disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-zinc-700 text-gray-700 dark:text-zinc-300 transition-colors"
          >
            Next
          </button>
        </div>
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
