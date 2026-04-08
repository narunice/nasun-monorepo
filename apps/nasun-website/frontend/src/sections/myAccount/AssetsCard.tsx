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
import { OwnedObjects } from "./OwnedObjects";
import { NasunVoteNfts } from "./NasunVoteNfts";
import { FeaturedNftSection } from "./components/FeaturedNftSection";
import { useWalletRegistration } from "./hooks/useWalletRegistration";
import { useNftDropRead } from "@/hooks/useNftDrop";
import { useGenesisPassOwnership } from "@/hooks/useGenesisPassOwnership";
import { NFT_EDITIONS } from "@/constants/nft-drop";

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
  const { registeredWallets } = useWalletRegistration();

  const {
    data: multiChainNfts,
    error: nftError,
    isPending: isNftPending,
    refetch: refetchNfts,
  } = useMultiChainNFTs(walletAddress);

  const { transfersUnlocked, mintDeadline } = useNftDropRead();

  // Transfer lock ends when contract unlocks OR mint deadline has passed
  const isDropEnded = mintDeadline > 0 && Date.now() / 1000 > mintDeadline;
  const effectiveTransfersUnlocked = transfersUnlocked || isDropEnded;

  // On-chain ownership for enriching Alchemy data when tokenId is missing
  const evmWalletAddress =
    user?.linkedAccounts?.metamask?.walletAddress?.toLowerCase() ||
    (user?.provider === "MetaMask" ? user.walletAddress?.toLowerCase() : undefined);
  const { ownedEditionIds } = useGenesisPassOwnership(evmWalletAddress);

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

  // Enrich featured NFTs: fill missing tokenId/name from on-chain data.
  // When multiple NFTs lack tokenId, assign each a unique owned edition 1:1.
  const enrichedFeaturedNfts = useMemo(() => {
    if (featuredNfts.length === 0) return featuredNfts;
    // Collect owned edition IDs not already used by NFTs that have a tokenId
    const usedIds = new Set(
      featuredNfts.filter((n) => n.tokenId).map((n) => Number(n.tokenId)),
    );
    const available = ownedEditionIds.filter((id) => !usedIds.has(id));
    let idx = 0;
    return featuredNfts.map((nft) => {
      if (nft.tokenId) return nft;
      const editionId = available[idx++];
      if (editionId == null) return nft; // no more editions to assign
      const edition = NFT_EDITIONS.find((e) => e.id === editionId);
      return {
        ...nft,
        tokenId: String(editionId),
        name: edition ? `Genesis Pass - ${edition.name}` : nft.name,
        description: edition?.description || nft.description,
      };
    });
  }, [featuredNfts, ownedEditionIds]);

  const hasFeaturedNfts = enrichedFeaturedNfts.length > 0 || (isAllianceMinted && !!allianceData);

  return (
    <OuterBox color="c5" padding="sm" className={`animate-fade-slide-up ${className}`}>
      <h5 className="font-medium uppercase text-nasun-white mb-4">MY ASSETS</h5>

      {/* Featured Collection first (Alliance + Genesis Pass) */}
      <FeaturedNftSection
        nfts={enrichedFeaturedNfts}
        collections={collections ?? []}
        walletAddress={walletAddress}
        isTransferLocked={!effectiveTransfersUnlocked}
        refetchNfts={refetchNfts}
        allianceData={isAllianceMinted && allianceData ? allianceData : undefined}
      />

      {/* Vote Proof NFTs (no Alliance, it moved to Featured) */}
      <NasunVoteNfts />

      <OwnedObjects
        nfts={regularNfts}
        isNftPending={isNftPending}
        nftError={nftError}
        hasFeaturedNfts={hasFeaturedNfts}
        walletAddress={walletAddress}
        registeredWallets={registeredWallets}
      />
    </OuterBox>
  );
};

export default AssetsCard;
