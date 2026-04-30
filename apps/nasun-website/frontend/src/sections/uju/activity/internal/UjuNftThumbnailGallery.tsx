import { FC, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import type { EthereumNFT } from '@/types/ethereum';
import type { NFTChain } from '@/services/ethereumApi';
import { getExplorerNFTUrl, getOpenSeaNFTUrl } from '@/services/ethereumApi';

// ============================================================================
// Chain Badge
// ============================================================================

const ChainBadge: FC<{ chain: NFTChain }> = ({ chain }) => {
  const isEth = chain === 'ethereum';
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-sm font-bold leading-none ${
        isEth
          ? 'bg-blue-500/10 text-blue-300 border border-blue-500/20'
          : 'bg-purple-500/10 text-purple-300 border border-purple-500/20'
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
  <div className="w-full aspect-square bg-uju-bg/60 rounded-lg flex items-center justify-center border border-uju-border/10">
    <svg
      className="w-8 h-8 text-uju-border/40"
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
  <div className="animate-pulse rounded-xl bg-uju-bg/40 border border-uju-border/20 overflow-hidden">
    <div className="w-full aspect-square bg-uju-bg/60" />
    <div className="p-2 space-y-2">
      <div className="h-3 bg-uju-bg/60 rounded w-3/4" />
      <div className="h-2.5 bg-uju-bg/60 rounded w-1/2" />
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

  const tid = nft.tokenId ?? "";
  const displayName =
    nft.name && nft.name !== `#${tid}`
      ? nft.name
      : nft.collectionName
        ? `${nft.collectionName} #${tid.length > 8 ? tid.slice(0, 6) + '...' : tid}`
        : `#${tid.length > 12 ? tid.slice(0, 8) + '...' : tid}`;

  return (
    <a
      href={linkUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group block rounded-xl bg-uju-bg/40 border border-uju-border/30 overflow-hidden
                 hover:border-pado-2/50 hover:bg-uju-bg/60 transition-all duration-200"
    >
      {/* Image */}
      {imageUrl && !imgFailed ? (
        <div className="w-full aspect-square overflow-hidden bg-uju-bg/80">
          <img
            src={imageUrl}
            alt={nft.name || 'NFT'}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
            onError={() => setImgFailed(true)}
          />
        </div>
      ) : (
        <NftPlaceholder />
      )}

      {/* Info */}
      <div className="p-2.5 space-y-1.5 border-t border-uju-border/10">
        <div className="flex items-center justify-between gap-1">
          <p className="text-sm text-uju-primary truncate font-bold group-hover:text-pado-2 transition-colors">
            {displayName}
          </p>
          <ExternalLink className="w-3 h-3 text-uju-secondary group-hover:text-pado-2 transition-colors shrink-0" />
        </div>
        <div className="flex items-center gap-1.5">
          <ChainBadge chain={chain} />
          {nft.collectionName && nft.name !== nft.collectionName && (
            <span className="text-sm text-uju-secondary truncate font-medium">
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

interface UjuNftThumbnailGalleryProps {
  nfts: EthereumNFT[] | undefined;
  isLoading: boolean;
  error: Error | null;
}

export const UjuNftThumbnailGallery: FC<UjuNftThumbnailGalleryProps> = ({
  nfts,
  isLoading,
  error,
}) => {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 rounded-xl bg-uju-bg/40 border border-red-500/20">
        <p className="text-sm text-uju-secondary font-medium">
          Unable to load NFTs. Please try again later.
        </p>
      </div>
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
