/**
 * UjuAssetsCard Component
 *
 * Orchestrates NFT data for the UJU Activity section.
 * Detached from myAccount dependencies.
 */

import { FC, useMemo } from "react";
import { useMultiChainNFTs } from "@/features/wallet";
import { useEnabledNftCollections } from "@/features/admin/hooks/useNftCollections";
import { useAuth } from "@/features/auth";
import { useAllianceMintStatus } from "@/hooks/useAllianceMintStatus";
import { useNftDropRead } from "@/hooks/useNftDrop";
import { useGenesisPassOwnership } from "@/hooks/useGenesisPassOwnership";
import {
  NFT_EDITIONS,
  getEditionIdFromMediaUrl,
  getEditionIdFromTokenUri,
} from "@/constants/nft-drop";
import { UjuCard, UjuSectionHeader } from "../../shared";
import { UjuFeaturedNftSection } from "../internal/UjuFeaturedNftSection";
import { UjuNasunVoteNfts } from "../internal/UjuNasunVoteNfts";
import { UjuOwnedObjects } from "../internal/UjuOwnedObjects";
import { useUjuWalletRegistration } from "../../hooks/useUjuWalletRegistration";

interface UjuAssetsCardProps {
  walletAddress?: string;
  className?: string;
}

export const UjuAssetsCard: FC<UjuAssetsCardProps> = ({
  walletAddress,
  className = "",
}) => {
  const { user } = useAuth();
  const cognitoToken = user?.cognitoToken;
  const { isMinted: isAllianceMinted, data: allianceData } = useAllianceMintStatus(cognitoToken);
  const { registeredWallets } = useUjuWalletRegistration();

  const {
    data: multiChainNfts,
    error: nftError,
    isPending: isNftPending,
    refetch: refetchNfts,
  } = useMultiChainNFTs(walletAddress);

  const { transfersUnlocked, mintDeadline } = useNftDropRead();

  const isDropEnded = mintDeadline > 0 && Date.now() / 1000 > mintDeadline;
  const effectiveTransfersUnlocked = transfersUnlocked || isDropEnded;

  const evmWalletAddress =
    user?.linkedAccounts?.metamask?.walletAddress?.toLowerCase() ||
    (user?.provider === "MetaMask" ? user.walletAddress?.toLowerCase() : undefined);
  const { ownedEditionIds } = useGenesisPassOwnership(evmWalletAddress);

  const { data: collections } = useEnabledNftCollections();

  const featuredSet = useMemo(() => {
    if (!collections) return new Set<string>();
    return new Set(
      collections
        .filter((c) => c.featured)
        .map((c) => `${c.contractAddress.toLowerCase()}:${c.chain}`)
    );
  }, [collections]);

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

  const enrichedFeaturedNfts = useMemo(() => {
    if (featuredNfts.length === 0) return featuredNfts;
    const usedIds = new Set(
      featuredNfts.filter((n) => n.tokenId).map((n) => Number(n.tokenId)),
    );
    const leftover = ownedEditionIds.filter((id) => !usedIds.has(id));
    let leftoverIdx = 0;
    return featuredNfts.map((nft) => {
      if (nft.tokenId) return nft;
      const matchedId =
        getEditionIdFromTokenUri(nft.tokenUri) ??
        getEditionIdFromMediaUrl(nft.imageUrl) ??
        getEditionIdFromMediaUrl(nft.thumbnailUrl) ??
        leftover[leftoverIdx++];
      if (matchedId == null) return nft;
      const edition = NFT_EDITIONS.find((e) => e.id === matchedId);
      if (!edition) return nft;
      return {
        ...nft,
        tokenId: String(matchedId),
        name: `Genesis Pass - ${edition.name}`,
      };
    });
  }, [featuredNfts, ownedEditionIds]);

  const hasFeaturedNfts = enrichedFeaturedNfts.length > 0 || (isAllianceMinted && !!allianceData);

  return (
    <UjuCard className={`animate-fade-slide-up ${className}`}>
      <UjuSectionHeader
        accent
        title="Assets"
        subtitle="Your NFTs and on-chain holdings across networks"
      />

      <UjuFeaturedNftSection
        nfts={enrichedFeaturedNfts}
        collections={collections ?? []}
        walletAddress={walletAddress}
        isTransferLocked={!effectiveTransfersUnlocked}
        refetchNfts={refetchNfts}
        allianceData={isAllianceMinted && allianceData ? allianceData : undefined}
      />

      <UjuNasunVoteNfts />

      <UjuOwnedObjects
        nfts={regularNfts}
        isNftPending={isNftPending}
        nftError={nftError}
        hasFeaturedNfts={hasFeaturedNfts}
        walletAddress={walletAddress}
        registeredWallets={registeredWallets}
      />
    </UjuCard>
  );
};

export default UjuAssetsCard;
