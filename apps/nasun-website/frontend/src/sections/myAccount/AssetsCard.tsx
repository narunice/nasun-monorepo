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
import { useGenesisPassStatus } from "@/hooks/useGenesisPassStatus";
import {
  NFT_EDITIONS,
  getEditionIdFromMediaUrl,
  getEditionIdFromTokenUri,
} from "@/constants/nft-drop";

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

  // Derive EVM address: MetaMask connected wallet, or the wallet registered on the allowlist.
  // This ensures Genesis Pass remains visible even when MetaMask is not actively connected.
  const evmWalletAddress =
    user?.linkedAccounts?.metamask?.walletAddress?.toLowerCase() ||
    (user?.provider === "MetaMask" ? user.walletAddress?.toLowerCase() : undefined);
  const { registeredWallet: genesisPassWallet } = useGenesisPassStatus(
    evmWalletAddress,
    evmWalletAddress ? null : cognitoToken,
  );
  const effectiveEvmAddress = evmWalletAddress || genesisPassWallet?.toLowerCase() || undefined;

  const {
    data: multiChainNfts,
    error: nftError,
    isPending: isNftPending,
    refetch: refetchNfts,
  } = useMultiChainNFTs(walletAddress || effectiveEvmAddress);

  const { transfersUnlocked, mintDeadline } = useNftDropRead();

  // Transfer lock ends when contract unlocks OR mint deadline has passed
  const isDropEnded = mintDeadline > 0 && Date.now() / 1000 > mintDeadline;
  const effectiveTransfersUnlocked = transfersUnlocked || isDropEnded;

  const { ownedEditionIds } = useGenesisPassOwnership(effectiveEvmAddress);

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

  // Fill missing tokenId/name by recovering the edition id from the NFT's own
  // metadata (tokenUri preferred, image CID fallback). Earlier versions paired
  // names by index order, which mis-labeled multi-NFT holders when Alchemy
  // returned NFTs in a different order than ownedEditionIds.
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
    <OuterBox color="w2" padding="sm" className={`animate-fade-slide-up ${className}`}>
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
