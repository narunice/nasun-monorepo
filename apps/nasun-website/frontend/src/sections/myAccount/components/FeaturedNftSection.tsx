/**
 * FeaturedNftSection Component
 *
 * Displays featured NFT collections with premium visual treatment.
 * Featured collections are admin-configured and shown above the regular NFT gallery.
 */

import { FC, useState } from "react";
import { ExternalLink, Wallet } from "lucide-react";
import type { EthereumNFT } from "@/types/ethereum";
import type { NftCollection } from "@/features/admin/types";
import {
  getExplorerNFTUrl,
  getOpenSeaNFTUrl,
  type NFTChain,
} from "@/services/ethereumApi";

interface FeaturedNftSectionProps {
  nfts: EthereumNFT[];
  collections: NftCollection[];
  walletAddress?: string;
}

const FeaturedNftCard: FC<{ nft: EthereumNFT; collectionName: string }> = ({
  nft,
  collectionName,
}) => {
  const chain = (nft.chain ?? "ethereum") as NFTChain;
  const imageUrl = nft.thumbnailUrl || nft.imageUrl;
  const openSeaUrl = getOpenSeaNFTUrl(nft.contractAddress, nft.tokenId, chain);
  const explorerUrl = getExplorerNFTUrl(
    nft.contractAddress,
    nft.tokenId,
    chain,
  );
  const linkUrl = openSeaUrl || explorerUrl;
  const [imgFailed, setImgFailed] = useState(false);

  const displayName =
    nft.name && nft.name !== `#${nft.tokenId}`
      ? nft.name
      : `${collectionName} #${nft.tokenId.length > 8 ? nft.tokenId.slice(0, 6) + "..." : nft.tokenId}`;

  return (
    <a
      href={linkUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group block rounded-lg bg-gray-800/60 border border-gray-700/50 overflow-hidden
                 ring-2 ring-amber-500/30 hover:ring-amber-400/50 hover:bg-gray-800 transition-all duration-200"
    >
      {imageUrl && !imgFailed ? (
        <div className="w-full aspect-square overflow-hidden bg-gray-900">
          <img
            src={imageUrl}
            alt={displayName}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
            loading="lazy"
            onError={() => setImgFailed(true)}
          />
        </div>
      ) : (
        <div className="w-full aspect-square bg-gray-800 rounded-lg flex items-center justify-center">
          <svg
            className="w-10 h-10 text-gray-600"
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
      )}

      <div className="p-3 space-y-1.5">
        <div className="flex items-center justify-between gap-1">
          <p className="text-sm text-gray-200 truncate font-medium flex-1">
            {displayName}
          </p>
          <ExternalLink className="w-3.5 h-3.5 text-gray-500 group-hover:text-amber-400 flex-shrink-0" />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-sm font-medium leading-none bg-amber-500/20 text-amber-300">
            Featured
          </span>
          <span className="text-sm text-gray-500 truncate">
            {collectionName}
          </span>
        </div>
      </div>
    </a>
  );
};

export const FeaturedNftSection: FC<FeaturedNftSectionProps> = ({
  nfts,
  collections,
  walletAddress,
}) => {
  const featuredCollections = collections.filter((c) => c.featured);
  if (featuredCollections.length === 0) return null;

  // No wallet connected: show CTA
  if (!walletAddress) {
    return (
      <div className="flex items-center gap-3 p-4 rounded-lg bg-amber-500/5 border border-amber-500/20 mb-4">
        <Wallet className="w-5 h-5 text-amber-400 flex-shrink-0" />
        <p className="text-sm text-amber-200/80">
          Link your MetaMask wallet to view your Genesis Pass.
        </p>
      </div>
    );
  }

  // NFTs are already pre-filtered by AssetsCard (featured only), no re-filtering needed.
  if (nfts.length === 0) return null;

  // Map contract address to collection name for display
  const collectionNameMap = new Map(
    featuredCollections.map((c) => [
      `${c.contractAddress}:${c.chain}`,
      c.collectionName,
    ]),
  );

  return (
    <div className="mb-6">
      <h6 className="font-semibold mb-3 text-amber-200/90">
        Featured Collection
      </h6>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {nfts.map((nft, i) => {
          const chain = nft.chain ?? "ethereum";
          const name =
            collectionNameMap.get(
              `${nft.contractAddress.toLowerCase()}:${chain}`,
            ) || "Featured";
          return (
            <FeaturedNftCard
              key={`featured-${nft.contractAddress}-${nft.tokenId ?? i}`}
              nft={nft}
              collectionName={name}
            />
          );
        })}
      </div>
    </div>
  );
};
