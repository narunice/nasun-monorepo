/**
 * FeaturedNftSection Component
 *
 * Displays featured NFT collections with premium visual treatment.
 * Featured collections are admin-configured and shown above the regular NFT gallery.
 * Supports transfer-locked state during active drops.
 */

import { FC, useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, Wallet, X } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import type { EthereumNFT } from "@/types/ethereum";
import type { NftCollection } from "@/features/admin/types";
import {
  getExplorerNFTUrl,
  getEtherscanContractUrl,
  getOpenSeaNFTUrl,
  type NFTChain,
} from "@/services/ethereumApi";
import { NFT_EDITIONS, getEditionVideoUrl } from "@/constants/nft-drop";
import { ALLIANCE_PREVIEW_IMAGES, ALLIANCE_NAMES } from "@/constants/alliance";
import { EvmWalletLinkButton } from "./EvmWalletLink";

interface AllianceData {
  imageIndex: number;
  walletAddress: string;
  txDigest: string;
  nftObjectId: string;
  mintedAt: string;
}

interface FeaturedNftSectionProps {
  nfts: EthereumNFT[];
  collections: NftCollection[];
  walletAddress?: string;
  isTransferLocked?: boolean;
  refetchNfts?: () => void;
  allianceData?: AllianceData;
}

// Match token ID to edition info from NFT_EDITIONS
function getEditionInfo(tokenId: string | undefined) {
  if (!tokenId) return undefined;
  const id = parseInt(tokenId, 10);
  if (isNaN(id)) return undefined;
  return NFT_EDITIONS.find((e) => e.id === id);
}

// --- Detail Modal ---

const FeaturedNftDetailModal: FC<{
  nft: EthereumNFT;
  collectionName: string;
  isTransferLocked?: boolean;
  onClose: () => void;
}> = ({ nft, collectionName, isTransferLocked, onClose }) => {
  const chain = (nft.chain ?? "ethereum") as NFTChain;
  const tid = nft.tokenId || "";
  const hasTid = tid !== "" && tid !== "0";
  // If tokenId is missing, link to the contract page instead of a broken /nft/ URL
  const explorerUrl = hasTid
    ? getExplorerNFTUrl(nft.contractAddress, tid, chain)
    : getEtherscanContractUrl(nft.contractAddress);
  const openSeaUrl = hasTid
    ? getOpenSeaNFTUrl(nft.contractAddress, tid, chain)
    : null;
  const edition = getEditionInfo(nft.tokenId);
  const videoRef = useRef<HTMLVideoElement>(null);

  const displayName = nft.name && nft.name !== `#${tid}`
    ? nft.name
    : edition
      ? `${collectionName} - ${edition.name}`
      : `${collectionName} #${tid}`;

  const description = nft.description || edition?.description || "";
  const shortAddress = `${nft.contractAddress.slice(0, 6)}...${nft.contractAddress.slice(-4)}`;

  // Auto-play video when modal opens
  useEffect(() => {
    videoRef.current?.play().catch(() => {});
  }, []);

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-8"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/85 backdrop-blur-md" />

      {/* Modal Content */}
      <div
        className="relative w-full max-w-lg animate-fade-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute -top-2 -right-2 z-20 w-9 h-9 flex items-center justify-center rounded-full bg-gray-900 border border-gray-600 text-gray-400 hover:text-white hover:border-gray-400 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Card */}
        <div className="rounded-2xl overflow-hidden bg-gray-900 border border-emerald-500/30 shadow-[0_0_60px_rgba(16,185,129,0.1)]">
          {/* Video / Image area */}
          <div className="relative aspect-square bg-black overflow-hidden">
            <video
              ref={videoRef}
              src={edition ? getEditionVideoUrl(edition.name) : "/videos/genesispass-encoded-web/colony-web.mp4"}
              muted
              loop
              playsInline
              className="w-full h-full object-cover"
            />

            {/* Edition badge */}
            {edition && (
              <div className="absolute top-4 left-4">
                <span className="text-sm font-mono tracking-wider uppercase px-3 py-1.5 rounded-lg bg-black/60 text-white/90 backdrop-blur-sm border border-white/10">
                  #{tid} {edition.name}
                </span>
              </div>
            )}

            {/* Featured badge */}
            <div className="absolute top-4 right-4">
              <span className="px-2.5 py-1 rounded-lg text-sm font-semibold bg-emerald-500/20 text-emerald-300 backdrop-blur-sm border border-emerald-500/30">
                Featured
              </span>
            </div>

            {/* Bottom gradient */}
            <div className="absolute bottom-0 inset-x-0 h-32 bg-gradient-to-t from-gray-900 to-transparent" />
          </div>

          {/* Info section */}
          <div className="p-5 -mt-8 relative space-y-4">
            {/* Title + Collection */}
            <div>
              <h3 className="text-xl font-semibold text-white leading-tight">
                {displayName}
              </h3>
              <p className="text-sm text-emerald-300/80 mt-1">{collectionName}</p>
            </div>

            {/* Description */}
            {description && (
              <p className="text-sm text-gray-400 leading-relaxed">{description}</p>
            )}

            {/* Metadata grid */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="p-3 rounded-lg bg-gray-800/80 border border-gray-700/50">
                <p className="text-gray-400 text-sm">Token ID</p>
                <p className="text-gray-200 font-mono">{hasTid ? tid : "Pending"}</p>
              </div>
              <div className="p-3 rounded-lg bg-gray-800/80 border border-gray-700/50">
                <p className="text-gray-400 text-sm">Standard</p>
                <p className="text-gray-200">{nft.tokenType || "ERC-1155"}</p>
              </div>
              <div className="col-span-2 p-3 rounded-lg bg-gray-800/80 border border-gray-700/50">
                <p className="text-gray-400 text-sm">Contract</p>
                <p className="text-gray-200 font-mono">{shortAddress}</p>
              </div>
            </div>

            {/* Transfer lock notice */}
            {isTransferLocked && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20 text-sm text-emerald-200/80">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                </svg>
                Trading opens after the drop ends
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-3 pt-1">
              <a
                href={explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-600 text-sm text-gray-200 hover:text-white transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Etherscan
              </a>
              {openSeaUrl && !isTransferLocked && (
                <a
                  href={openSeaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-sm text-emerald-300 hover:text-emerald-200 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  OpenSea
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

// --- Card ---

const FeaturedNftCard: FC<{
  nft: EthereumNFT;
  collectionName: string;
  isTransferLocked?: boolean;
}> = ({ nft, collectionName, isTransferLocked }) => {
  const [showModal, setShowModal] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const imageUrl = nft.thumbnailUrl || nft.imageUrl;
  const edition = getEditionInfo(nft.tokenId);

  const tid = nft.tokenId ?? "";
  const displayName =
    nft.name && nft.name !== `#${tid}`
      ? nft.name
      : edition
        ? `${edition.name} Edition`
        : `${collectionName} #${tid.length > 8 ? tid.slice(0, 6) + "..." : tid}`;

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="group block w-full rounded-lg bg-gray-800/60 border border-gray-700/50 overflow-hidden
                   ring-2 ring-emerald-500/30 hover:ring-emerald-400/50 hover:bg-gray-800 transition-all duration-200 text-left cursor-pointer"
      >
        {imageUrl && !imgFailed ? (
          <div className="w-full aspect-square overflow-hidden bg-gray-900">
            <img
              src={imageUrl}
              alt={displayName}
              className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
              loading="lazy"
              onError={() => setImgFailed(true)}
            />
          </div>
        ) : (
          <div className="w-full aspect-square bg-gray-900 overflow-hidden relative">
            <video
              src={edition ? getEditionVideoUrl(edition.name) : "/videos/genesispass-encoded-web/colony-web.mp4"}
              muted
              loop
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />
          </div>
        )}

        <div className="p-3 h-[4.5rem] flex flex-col justify-center">
          <p className="text-sm text-gray-200 truncate font-medium">
            {displayName}
          </p>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-sm font-medium leading-none bg-emerald-500/20 text-emerald-300">
              Featured
            </span>
            <span className="text-sm text-gray-400 truncate">
              {collectionName}
            </span>
          </div>
        </div>
      </button>

      {showModal && (
        <FeaturedNftDetailModal
          nft={nft}
          collectionName={collectionName}
          isTransferLocked={isTransferLocked}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
};

// --- Alliance Detail Modal ---

const AllianceDetailModal: FC<{
  data: AllianceData;
  onClose: () => void;
}> = ({ data, onClose }) => {
  const name = ALLIANCE_NAMES[data.imageIndex] ?? "Alliance NFT";
  const imageSrc = ALLIANCE_PREVIEW_IMAGES[data.imageIndex] || ALLIANCE_PREVIEW_IMAGES[0];
  const shortObj = `${data.nftObjectId.slice(0, 6)}...${data.nftObjectId.slice(-4)}`;
  const explorerObjUrl = `https://explorer.nasun.io/devnet/object/${data.nftObjectId}`;
  const explorerTxUrl = `https://explorer.nasun.io/devnet/tx/${data.txDigest}`;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-8"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/85 backdrop-blur-md" />
      <div
        className="relative w-full max-w-lg animate-fade-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute -top-2 -right-2 z-20 w-9 h-9 flex items-center justify-center rounded-full bg-gray-900 border border-gray-600 text-gray-400 hover:text-white hover:border-gray-400 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="rounded-2xl overflow-hidden bg-gray-900 border border-emerald-500/30 shadow-[0_0_60px_rgba(16,185,129,0.1)]">
          <div className="relative aspect-square bg-black overflow-hidden">
            <img
              src={imageSrc}
              alt={name}
              className="w-full h-full object-cover"
            />
            <div className="absolute top-4 left-4">
              <span className="text-sm font-semibold uppercase px-3 py-1.5 rounded-lg bg-black/60 text-white/90 backdrop-blur-sm border border-white/10">
                {name}
              </span>
            </div>
            <div className="absolute top-4 right-4">
              <span className="px-2.5 py-1 rounded-lg text-sm font-semibold bg-emerald-500/20 text-emerald-300 backdrop-blur-sm border border-emerald-500/30">
                Featured
              </span>
            </div>
            <div className="absolute bottom-0 inset-x-0 h-32 bg-gradient-to-t from-gray-900 to-transparent" />
          </div>

          <div className="p-5 -mt-8 relative space-y-4">
            <div>
              <h3 className="text-xl font-semibold text-white">{name}</h3>
              <p className="text-sm text-emerald-300/80 mt-1">Alliance NFT</p>
            </div>
            <p className="text-sm text-gray-400 leading-relaxed">
              A unique character from the Nasun Alliance collection, minted on Nasun Devnet.
            </p>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="p-3 rounded-lg bg-gray-800/80 border border-gray-700/50">
                <p className="text-gray-400 text-sm">Network</p>
                <p className="text-gray-200">Nasun Devnet</p>
              </div>
              <div className="p-3 rounded-lg bg-gray-800/80 border border-gray-700/50">
                <p className="text-gray-400 text-sm">Standard</p>
                <p className="text-gray-200">Nasun Object</p>
              </div>
              <div className="col-span-2 p-3 rounded-lg bg-gray-800/80 border border-gray-700/50">
                <p className="text-gray-400 text-sm">Object ID</p>
                <p className="text-gray-200 font-mono">{shortObj}</p>
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <a
                href={explorerObjUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-600 text-sm text-gray-200 hover:text-white transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Explorer
              </a>
              <a
                href={explorerTxUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-sm text-emerald-300 hover:text-emerald-200 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Mint Tx
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

// --- Alliance Card ---

const AllianceNftCard: FC<{ data: AllianceData }> = ({ data }) => {
  const [showModal, setShowModal] = useState(false);
  const name = ALLIANCE_NAMES[data.imageIndex] ?? "Alliance NFT";
  const imageSrc = ALLIANCE_PREVIEW_IMAGES[data.imageIndex] || ALLIANCE_PREVIEW_IMAGES[0];

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="group block w-full rounded-lg bg-gray-800/60 border border-gray-700/50 overflow-hidden
                   ring-2 ring-emerald-500/30 hover:ring-emerald-400/50 hover:bg-gray-800 transition-all duration-200 text-left cursor-pointer"
      >
        <div className="w-full aspect-square overflow-hidden bg-gray-900">
          <img
            src={imageSrc}
            alt={name}
            className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
            loading="lazy"
          />
        </div>
        <div className="p-3 h-[4.5rem] flex flex-col justify-center">
          <p className="text-sm text-gray-200 truncate font-medium">{name}</p>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-sm font-medium leading-none bg-emerald-500/20 text-emerald-300">
              Featured
            </span>
            <span className="text-sm text-gray-400 truncate">Alliance</span>
          </div>
        </div>
      </button>
      {showModal && (
        <AllianceDetailModal data={data} onClose={() => setShowModal(false)} />
      )}
    </>
  );
};

// --- Section ---

export const FeaturedNftSection: FC<FeaturedNftSectionProps> = ({
  nfts,
  collections,
  walletAddress,
  isTransferLocked,
  refetchNfts,
  allianceData,
}) => {
  const featuredCollections = collections.filter((c) => c.featured);
  const [searchParams, setSearchParams] = useSearchParams();
  const justMinted = searchParams.get("justMinted") === "genesis-pass";
  const [isPolling, setIsPolling] = useState(false);
  const cleanedUp = useRef(false);

  // ALL hooks must be called BEFORE any conditional return (React rules of hooks)

  // Poll for NFT appearance after fresh mint (Alchemy indexing delay)
  useEffect(() => {
    if (!justMinted || nfts.length > 0 || !refetchNfts) return;

    setIsPolling(true);
    const interval = setInterval(() => {
      refetchNfts();
    }, 5000);

    const timeout = setTimeout(() => {
      clearInterval(interval);
      setIsPolling(false);
      if (!cleanedUp.current) {
        cleanedUp.current = true;
        const next = new URLSearchParams(searchParams);
        next.delete("justMinted");
        setSearchParams(next, { replace: true });
      }
    }, 60000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [justMinted, nfts.length, refetchNfts]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clear justMinted param once NFT appears
  useEffect(() => {
    if (justMinted && nfts.length > 0 && !cleanedUp.current) {
      cleanedUp.current = true;
      setIsPolling(false);
      const next = new URLSearchParams(searchParams);
      next.delete("justMinted");
      setSearchParams(next, { replace: true });
    }
  }, [justMinted, nfts.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Conditional returns AFTER all hooks
  if (featuredCollections.length === 0 && !allianceData) return null;

  // No wallet connected: show CTA (only if there are featured collections to show)
  if (!walletAddress && featuredCollections.length > 0 && !allianceData) {
    return (
      <div className="flex items-center justify-between gap-3 p-4 rounded-lg bg-emerald-500/5 border border-emerald-500/20 mb-4">
        <div className="flex items-center gap-3">
          <Wallet className="w-5 h-5 text-emerald-400 flex-shrink-0" />
          <p className="text-sm text-emerald-200/80">
            Link your EVM wallet to view Genesis Pass
          </p>
        </div>
        <EvmWalletLinkButton />
      </div>
    );
  }

  // Map contract address to collection name for display
  const collectionNameMap = new Map(
    featuredCollections.map((c) => [
      `${c.contractAddress}:${c.chain}`,
      c.collectionName,
    ]),
  );

  // Nothing to show (no Alliance, no Ethereum NFTs, no justMinted)
  if (!allianceData && nfts.length === 0 && !justMinted) return null;

  return (
    <div className="mb-6">
      {/* justMinted polling message */}
      {justMinted && nfts.length === 0 && (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-emerald-500/5 border border-emerald-500/20 mb-3">
          <div className="w-4 h-4 border-2 border-emerald-400/60 border-t-transparent rounded-full animate-spin flex-shrink-0" />
          <p className="text-sm text-emerald-200/80">
            Your Genesis Pass is being confirmed on the blockchain. It may take a moment to appear.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {/* Alliance NFT card */}
        {allianceData && (
          <AllianceNftCard key="alliance" data={allianceData} />
        )}

        {/* Ethereum featured NFT cards (Genesis Pass etc.) */}
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
              isTransferLocked={isTransferLocked}
            />
          );
        })}
      </div>
    </div>
  );
};
