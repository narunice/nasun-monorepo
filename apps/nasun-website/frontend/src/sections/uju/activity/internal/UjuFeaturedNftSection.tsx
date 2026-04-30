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
import { UjuButton } from "../../shared";

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

  useEffect(() => {
    videoRef.current?.play().catch(() => {});
  }, []);

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-8"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-uju-bg/90 backdrop-blur-md" />

      <div
        className="relative w-full max-w-lg animate-fade-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute -top-2 -right-2 z-20 w-9 h-9 flex items-center justify-center rounded-full bg-uju-card border border-uju-border text-uju-secondary hover:text-uju-primary hover:border-pado-2 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="rounded-2xl overflow-hidden bg-uju-card border border-pado-4/30 shadow-[0_0_60px_rgba(134,243,183,0.1)]">
          <div className="relative aspect-square bg-black overflow-hidden">
            {edition ? (
              <video
                ref={videoRef}
                src={getEditionVideoUrl(edition.name)}
                muted
                loop
                playsInline
                className="w-full h-full object-cover"
              />
            ) : (
              <img
                src={nft.thumbnailUrl || nft.imageUrl}
                alt={displayName}
                className="w-full h-full object-cover"
              />
            )}

            {edition && (
              <div className="absolute top-4 left-4">
                <span className="text-sm font-bold tracking-wider uppercase px-3 py-1.5 rounded-lg bg-uju-bg/70 text-uju-primary backdrop-blur-sm border border-uju-border/30">
                  #{tid} {edition.name}
                </span>
              </div>
            )}

            <div className="absolute top-4 right-4">
              <span className="px-2.5 py-1 rounded-lg text-sm font-bold bg-pado-4/20 text-pado-4 backdrop-blur-sm border border-pado-4/30">
                FEATURED
              </span>
            </div>

            <div className="absolute bottom-0 inset-x-0 h-32 bg-gradient-to-t from-uju-card to-transparent" />
          </div>

          <div className="p-5 -mt-8 relative space-y-4">
            <div>
              <h3 className="text-xl font-bold text-uju-primary leading-tight">
                {displayName}
              </h3>
              <p className="text-sm text-pado-2 font-medium mt-1">{collectionName}</p>
            </div>

            {description && (
              <p className="text-sm text-uju-secondary leading-relaxed">{description}</p>
            )}

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="p-3 rounded-xl bg-uju-bg/50 border border-uju-border/20">
                <p className="text-uju-secondary text-sm font-medium uppercase tracking-wider mb-1">Token ID</p>
                <p className="text-uju-primary font-mono font-bold">{hasTid ? tid : "Pending"}</p>
              </div>
              <div className="p-3 rounded-xl bg-uju-bg/50 border border-uju-border/20">
                <p className="text-uju-secondary text-sm font-medium uppercase tracking-wider mb-1">Standard</p>
                <p className="text-uju-primary font-bold">{nft.tokenType || "ERC-1155"}</p>
              </div>
              <div className="col-span-2 p-3 rounded-xl bg-uju-bg/50 border border-uju-border/20">
                <p className="text-uju-secondary text-sm font-medium uppercase tracking-wider mb-1">Contract</p>
                <p className="text-uju-primary font-mono font-bold">{shortAddress}</p>
              </div>
            </div>

            {isTransferLocked && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-pado-4/5 border border-pado-4/20 text-sm text-pado-4">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                </svg>
                <span className="font-medium">Trading opens after the drop ends</span>
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <a
                href={explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1"
              >
                <UjuButton variant="secondary" className="w-full justify-center gap-2">
                  <ExternalLink className="w-3.5 h-3.5" />
                  Etherscan
                </UjuButton>
              </a>
              {openSeaUrl && !isTransferLocked && (
                <a
                  href={openSeaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1"
                >
                  <UjuButton variant="primary" className="w-full justify-center gap-2">
                    <ExternalLink className="w-3.5 h-3.5" />
                    OpenSea
                  </UjuButton>
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
        className="group block w-full rounded-xl bg-uju-bg/40 border border-uju-border/30 overflow-hidden
                   ring-1 ring-transparent hover:ring-pado-4/40 hover:bg-uju-bg/60 transition-all duration-200 text-left cursor-pointer shadow-lg"
      >
        {imageUrl && !imgFailed ? (
          <div className="w-full aspect-square overflow-hidden bg-uju-bg/80">
            <img
              src={imageUrl}
              alt={displayName}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
              loading="lazy"
              onError={() => setImgFailed(true)}
            />
          </div>
        ) : (
          <div className="w-full aspect-square bg-uju-bg/80 overflow-hidden relative">
            {edition ? (
              <video
                src={getEditionVideoUrl(edition.name)}
                muted
                loop
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-uju-bg/60">
                <span className="text-uju-secondary text-sm font-medium">No preview</span>
              </div>
            )}
          </div>
        )}

        <div className="p-3 h-[4.5rem] flex flex-col justify-center border-t border-uju-border/10">
          <p className="text-sm text-uju-primary truncate font-bold group-hover:text-pado-2 transition-colors">
            {displayName}
          </p>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-sm font-bold leading-none bg-pado-4/10 text-pado-4 border border-pado-4/20">
              FEATURED
            </span>
            <span className="text-sm text-uju-secondary truncate font-medium">
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
      <div className="absolute inset-0 bg-uju-bg/90 backdrop-blur-md" />
      <div
        className="relative w-full max-w-lg animate-fade-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute -top-2 -right-2 z-20 w-9 h-9 flex items-center justify-center rounded-full bg-uju-card border border-uju-border text-uju-secondary hover:text-uju-primary hover:border-pado-2 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="rounded-2xl overflow-hidden bg-uju-card border border-pado-4/30 shadow-[0_0_60px_rgba(134,243,183,0.1)]">
          <div className="relative aspect-square bg-black overflow-hidden">
            <img
              src={imageSrc}
              alt={name}
              className="w-full h-full object-cover"
            />
            <div className="absolute top-4 left-4">
              <span className="text-sm font-bold uppercase px-3 py-1.5 rounded-lg bg-uju-bg/70 text-uju-primary backdrop-blur-sm border border-uju-border/30">
                {name}
              </span>
            </div>
            <div className="absolute top-4 right-4">
              <span className="px-2.5 py-1 rounded-lg text-sm font-bold bg-pado-4/20 text-pado-4 backdrop-blur-sm border border-pado-4/30">
                FEATURED
              </span>
            </div>
            <div className="absolute bottom-0 inset-x-0 h-32 bg-gradient-to-t from-uju-card to-transparent" />
          </div>

          <div className="p-5 -mt-8 relative space-y-4">
            <div>
              <h3 className="text-xl font-bold text-uju-primary">{name}</h3>
              <p className="text-sm text-pado-2 font-medium mt-1">Alliance NFT</p>
            </div>
            <p className="text-sm text-uju-secondary leading-relaxed">
              A unique character from the Nasun Alliance collection, minted on Nasun Devnet.
            </p>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="p-3 rounded-xl bg-uju-bg/50 border border-uju-border/20">
                <p className="text-uju-secondary text-sm font-medium uppercase tracking-wider mb-1">Network</p>
                <p className="text-uju-primary font-bold">Nasun Devnet</p>
              </div>
              <div className="p-3 rounded-xl bg-uju-bg/50 border border-uju-border/20">
                <p className="text-uju-secondary text-sm font-medium uppercase tracking-wider mb-1">Standard</p>
                <p className="text-uju-primary font-bold">Nasun Object</p>
              </div>
              <div className="col-span-2 p-3 rounded-xl bg-uju-bg/50 border border-uju-border/20">
                <p className="text-uju-secondary text-sm font-medium uppercase tracking-wider mb-1">Object ID</p>
                <p className="text-uju-primary font-mono font-bold">{shortObj}</p>
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <a
                href={explorerObjUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1"
              >
                <UjuButton variant="secondary" className="w-full justify-center gap-2">
                  <ExternalLink className="w-3.5 h-3.5" />
                  Explorer
                </UjuButton>
              </a>
              <a
                href={explorerTxUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1"
              >
                <UjuButton variant="primary" className="w-full justify-center gap-2">
                  <ExternalLink className="w-3.5 h-3.5" />
                  Mint Tx
                </UjuButton>
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
        className="group block w-full rounded-xl bg-uju-bg/40 border border-uju-border/30 overflow-hidden
                   ring-1 ring-transparent hover:ring-pado-4/40 hover:bg-uju-bg/60 transition-all duration-200 text-left cursor-pointer shadow-lg"
      >
        <div className="w-full aspect-square overflow-hidden bg-uju-bg/80">
          <img
            src={imageSrc}
            alt={name}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
            loading="lazy"
          />
        </div>
        <div className="p-3 h-[4.5rem] flex flex-col justify-center border-t border-uju-border/10">
          <p className="text-sm text-uju-primary truncate font-bold group-hover:text-pado-2 transition-colors">{name}</p>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-sm font-bold leading-none bg-pado-4/10 text-pado-4 border border-pado-4/20">
              FEATURED
            </span>
            <span className="text-sm text-uju-secondary truncate font-medium">Alliance</span>
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

export const UjuFeaturedNftSection: FC<FeaturedNftSectionProps> = ({
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
  }, [justMinted, nfts.length, refetchNfts]);

  useEffect(() => {
    if (justMinted && nfts.length > 0 && !cleanedUp.current) {
      cleanedUp.current = true;
      setIsPolling(false);
      const next = new URLSearchParams(searchParams);
      next.delete("justMinted");
      setSearchParams(next, { replace: true });
    }
  }, [justMinted, nfts.length]);

  if (featuredCollections.length === 0 && !allianceData) return null;

  if (!walletAddress && featuredCollections.length > 0 && !allianceData) {
    return (
      <div className="flex items-center justify-between gap-3 p-4 rounded-xl bg-pado-4/5 border border-pado-4/20 mb-6">
        <div className="flex items-center gap-3">
          <Wallet className="w-5 h-5 text-pado-4 flex-shrink-0" />
          <p className="text-sm text-uju-secondary font-medium">
            Link your EVM wallet to view Genesis Pass
          </p>
        </div>
        <EvmWalletLinkButton />
      </div>
    );
  }

  const collectionNameMap = new Map(
    featuredCollections.map((c) => [
      `${c.contractAddress}:${c.chain}`,
      c.collectionName,
    ]),
  );

  if (!allianceData && nfts.length === 0 && !justMinted) return null;

  return (
    <div className="mb-8">
      {justMinted && nfts.length === 0 && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-pado-4/5 border border-pado-4/20 mb-4">
          <div className="w-4 h-4 border-2 border-pado-4/60 border-t-transparent rounded-full animate-spin flex-shrink-0" />
          <p className="text-sm text-pado-4 font-medium">
            Your Genesis Pass is being confirmed on the blockchain. It may take a moment to appear.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {allianceData && (
          <AllianceNftCard key="alliance" data={allianceData} />
        )}

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
