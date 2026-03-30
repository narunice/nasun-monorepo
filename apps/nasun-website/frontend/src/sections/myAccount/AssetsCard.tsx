/**
 * AssetsCard Component
 *
 * Orchestrates NFT data for the MY ASSETS bento grid card.
 * Splits multi-chain NFTs into featured and regular, passing each
 * to the appropriate child component.
 */

import { FC, useMemo } from "react";
import { OuterBox } from "@/components/ui";
import { useMultiChainNFTs } from "@/features/wallet";
import { useEnabledNftCollections } from "@/features/admin/hooks/useNftCollections";
import { useAuth } from "@/features/auth";
import { useAllianceMintStatus } from "@/hooks/useAllianceMintStatus";
import { ALLIANCE_PREVIEW_IMAGES, ALLIANCE_NAMES } from "@/constants/alliance";
import { OwnedObjects } from "./OwnedObjects";
import { NasunVoteNfts } from "./NasunVoteNfts";
import { FeaturedNftSection } from "./components/FeaturedNftSection";

interface AssetsCardProps {
  walletAddress?: string;
  className?: string;
}

export const AssetsCard: FC<AssetsCardProps> = ({
  walletAddress,
  className = "",
}) => {
  const { user } = useAuth();
  const cognitoToken = user?.cognitoToken;
  const { isMinted: isAllianceMinted, data: allianceData } = useAllianceMintStatus(cognitoToken);

  const {
    data: multiChainNfts,
    error: nftError,
    isPending: isNftPending,
  } = useMultiChainNFTs(walletAddress);

  const { data: collections } = useEnabledNftCollections();

  // Build a set of featured contract+chain keys for splitting
  const featuredSet = useMemo(() => {
    if (!collections) return new Set<string>();
    return new Set(
      collections
        .filter((c) => c.featured)
        .map((c) => `${c.contractAddress.toLowerCase()}:${c.chain}`)
    );
  }, [collections]);

  // Split NFTs into featured and regular
  const { featuredNfts, regularNfts } = useMemo(() => {
    if (!multiChainNfts || featuredSet.size === 0) {
      return { featuredNfts: [], regularNfts: multiChainNfts };
    }
    const featured: typeof multiChainNfts = [];
    const regular: typeof multiChainNfts = [];
    for (const nft of multiChainNfts) {
      const chain = nft.chain ?? "ethereum";
      const key = `${nft.contractAddress.toLowerCase()}:${chain}`;
      if (featuredSet.has(key)) {
        featured.push(nft);
      } else {
        regular.push(nft);
      }
    }
    return { featuredNfts: featured, regularNfts: regular };
  }, [multiChainNfts, featuredSet]);

  const hasFeaturedNfts = featuredNfts.length > 0;

  return (
    <OuterBox color="c5" padding="sm" className={`animate-fade-slide-up ${className}`}>
      <h5 className="font-medium uppercase text-nasun-white mb-4">MY ASSETS</h5>

      <NasunVoteNfts>
        {isAllianceMinted && allianceData && (
          <div className="group relative rounded-lg overflow-hidden border border-nasun-white/10 bg-nasun-white/[0.03] hover:border-nasun-nw1/30 transition-colors">
            <div className="aspect-square">
              <a
                href={`https://explorer.nasun.io/devnet/object/${allianceData.nftObjectId}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <img
                  src={ALLIANCE_PREVIEW_IMAGES[allianceData.imageIndex] || ALLIANCE_PREVIEW_IMAGES[0]}
                  alt={ALLIANCE_NAMES[allianceData.imageIndex] || "Alliance NFT"}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </a>
            </div>
            <div className="p-2">
              <p className="text-sm text-nasun-white/40 uppercase tracking-wider">Alliance</p>
              <p className="text-sm text-nasun-white/60 font-mono truncate" title={allianceData.nftObjectId}>
                {allianceData.nftObjectId.slice(0, 6)}...{allianceData.nftObjectId.slice(-4)}
              </p>
              <p className="text-sm text-nasun-white/50 truncate mt-0.5">
                {ALLIANCE_NAMES[allianceData.imageIndex] || "Alliance NFT"}
              </p>
            </div>
          </div>
        )}
      </NasunVoteNfts>
      <FeaturedNftSection
        nfts={featuredNfts}
        collections={collections ?? []}
        walletAddress={walletAddress}
      />
      <OwnedObjects
        nfts={regularNfts}
        isNftPending={isNftPending}
        nftError={nftError}
        hasFeaturedNfts={hasFeaturedNfts}
        walletAddress={walletAddress}
      />
    </OuterBox>
  );
};

export default AssetsCard;
