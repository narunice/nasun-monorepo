/**
 * NftThumbnailGallery Component
 *
 * Responsive grid of NFT thumbnail cards for the MY ASSETS section.
 * Supports Ethereum and Polygon NFTs with chain badges.
 */

import { FC, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import type { EthereumNFT } from '../../../types/ethereum';
import type { NFTChain } from '../../../services/ethereumApi';
import { getExplorerNFTUrl, getOpenSeaNFTUrl } from '../../../services/ethereumApi';

// ============================================================================
// Chain Badge
// ============================================================================

const ChainBadge: FC<{ chain: NFTChain }> = ({ chain }) => {
  const isEth = chain === 'ethereum';
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-sm font-medium leading-none ${
        isEth
          ? 'bg-blue-500/20 text-blue-300'
          : 'bg-purple-500/20 text-purple-300'
      }`}
    >
      {isEth ? 'ETH' : 'POLY'}
    </span>
  );
};

// ============================================================================
// NFT Placeholder (no image)
// ============================================================================

const NftPlaceholder: FC = () => (
  <div className="w-full aspect-square bg-gray-800 rounded-lg flex items-center justify-center">
    <svg
      className="w-8 h-8 text-gray-600"
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
  </div>
);

// ============================================================================
// Skeleton Loading
// ============================================================================

const SkeletonCard: FC = () => (
  <div className="animate-pulse rounded-lg bg-gray-800/60 overflow-hidden">
    <div className="w-full aspect-square bg-gray-700/50" />
    <div className="p-2 space-y-1.5">
      <div className="h-3 bg-gray-700/50 rounded w-3/4" />
      <div className="h-2.5 bg-gray-700/50 rounded w-1/2" />
    </div>
  </div>
);

// ============================================================================
// Single NFT Thumbnail Card
// ============================================================================

interface NftThumbnailProps {
  nft: EthereumNFT;
}

const NftThumbnail: FC<NftThumbnailProps> = ({ nft }) => {
  const chain = nft.chain ?? 'ethereum';
  const imageUrl = nft.thumbnailUrl || nft.imageUrl;
  const explorerUrl = getExplorerNFTUrl(nft.contractAddress, nft.tokenId, chain);
  const openSeaUrl = getOpenSeaNFTUrl(nft.contractAddress, nft.tokenId, chain);
  const linkUrl = openSeaUrl || explorerUrl;
  const [imgFailed, setImgFailed] = useState(false);

  const displayName =
    nft.name && nft.name !== `#${nft.tokenId}`
      ? nft.name
      : nft.collectionName
        ? `${nft.collectionName} #${nft.tokenId.length > 8 ? nft.tokenId.slice(0, 6) + '...' : nft.tokenId}`
        : `#${nft.tokenId.length > 12 ? nft.tokenId.slice(0, 8) + '...' : nft.tokenId}`;

  return (
    <a
      href={linkUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group block rounded-lg bg-gray-800/60 border border-gray-700/50 overflow-hidden
                 hover:border-nasun-c4/50 hover:bg-gray-800 transition-all duration-200"
    >
      {/* Image */}
      {imageUrl && !imgFailed ? (
        <div className="w-full aspect-square overflow-hidden bg-gray-900">
          <img
            src={imageUrl}
            alt={nft.name || 'NFT'}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
            loading="lazy"
            onError={() => setImgFailed(true)}
          />
        </div>
      ) : (
        <NftPlaceholder />
      )}

      {/* Info */}
      <div className="p-2 space-y-1">
        <div className="flex items-center justify-between gap-1">
          <p className="text-sm text-gray-200 truncate font-medium flex-1">
            {displayName}
          </p>
          <ExternalLink className="w-3 h-3 text-gray-500 group-hover:text-nasun-c4 flex-shrink-0" />
        </div>
        <div className="flex items-center gap-1.5">
          <ChainBadge chain={chain} />
          {nft.collectionName && nft.name !== nft.collectionName && (
            <span className="text-sm text-gray-500 truncate">
              {nft.collectionName}
            </span>
          )}
        </div>
      </div>
    </a>
  );
};

// ============================================================================
// Main Gallery Component
// ============================================================================

interface NftThumbnailGalleryProps {
  nfts: EthereumNFT[] | undefined;
  isLoading: boolean;
  error: Error | null;
}

export const NftThumbnailGallery: FC<NftThumbnailGalleryProps> = ({
  nfts,
  isLoading,
  error,
}) => {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-gray-500">
        Unable to load NFTs. Please try again later.
      </p>
    );
  }

  if (!nfts || nfts.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
      {nfts.map((nft, i) => (
        <NftThumbnail
          key={`${nft.chain ?? 'eth'}-${nft.contractAddress}-${nft.tokenId ?? i}`}
          nft={nft}
        />
      ))}
    </div>
  );
};
