// OwnedObjects.tsx
// Multi-chain NFT thumbnail gallery + Sui objects display
// NFT data is received as props from AssetsCard (which handles featured/regular splitting).

import { useState } from "react";
import { useWalletAccount } from "@nasun/wallet";
import { useSuiClientQuery } from "@mysten/dapp-kit";
import type { EthereumNFT } from "@/types/ethereum";
import { SuiObject } from "./SuiObjects";
import { NftThumbnailGallery } from "./components/NftThumbnailGallery";

interface OwnedObjectsProps {
  nfts: EthereumNFT[] | undefined;
  isNftPending: boolean;
  nftError: Error | null;
  hasFeaturedNfts: boolean;
  walletAddress?: string;
}

export const OwnedObjects = ({
  nfts,
  isNftPending,
  nftError,
  hasFeaturedNfts,
  walletAddress,
}: OwnedObjectsProps) => {
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  // Sui objects
  const suiAccount = useWalletAccount();
  const {
    data: suiResponse,
    error: suiError,
    isPending: isSuiPending,
  } = useSuiClientQuery(
    "getOwnedObjects",
    {
      owner: suiAccount?.address as string,
      options: {
        showType: true,
        showOwner: true,
        showContent: true,
        showDisplay: true,
      },
    },
    { enabled: !!suiAccount }
  );

  const filterStrings = import.meta.env.VITE_FILTER_STRINGS?.split(",") || [];
  const suiObjects =
    suiAccount && suiResponse?.data
      ? suiResponse.data.filter((objectRes) =>
          objectRes.data?.type &&
          filterStrings.some((filter: string) => objectRes.data?.type!.includes(filter))
        )
      : [];

  const nftCount = nfts?.length ?? 0;
  const hasNoAssets =
    suiObjects.length === 0 && nftCount === 0 && !hasFeaturedNfts && !isNftPending && !isSuiPending;

  // Pagination for Sui objects
  const totalPages = Math.ceil(suiObjects.length / itemsPerPage);
  const suiStartIndex = (currentPage - 1) * itemsPerPage;
  const suiEndIndex = suiStartIndex + itemsPerPage;
  const paginatedSuiObjects = suiObjects.slice(suiStartIndex, suiEndIndex);

  const handlePageClick = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  return (
    <div className="flex flex-col space-y-6">
      {hasNoAssets && (
        <p className="pt-4 text-gray-400">No objects found.</p>
      )}

      {/* Ethereum & Polygon NFTs (non-featured) */}
      {walletAddress && (
        <NftThumbnailGallery
          nfts={nfts}
          isLoading={isNftPending}
          error={nftError}
        />
      )}

      {/* Sui Objects */}
      {suiAccount && (
        <div>
          {isSuiPending ? (
            <p className="text-gray-400">Loading...</p>
          ) : suiError ? (
            <p className="text-nasun-white">
              Error loading Sui objects: {suiError.message}
            </p>
          ) : paginatedSuiObjects.length > 0 ? (
            <>
              <h6 className="font-semibold mb-4 text-gray-200">
                Nasun Objects ({suiObjects.length})
              </h6>
              <div className="space-y-4">
                {paginatedSuiObjects.map((objectRes) => (
                  <SuiObject key={`sui-${objectRes.data?.objectId}`} objectRes={objectRes} />
                ))}
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* Sui Pagination */}
      {suiObjects.length > itemsPerPage && (
        <div className="flex justify-center items-center space-x-2 pt-2">
          <button
            onClick={() => handlePageClick(currentPage - 1)}
            disabled={currentPage === 1}
            className="px-3 py-1 rounded-sm border border-gray-800 disabled:opacity-50"
          >
            &lt;
          </button>

          {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
            <button
              key={page}
              onClick={() => handlePageClick(page)}
              className={`px-3 py-1 rounded-sm border border-gray-800 ${
                currentPage === page
                  ? "bg-gray-200 text-black"
                  : "bg-black"
              }`}
            >
              {page}
            </button>
          ))}

          <button
            onClick={() => handlePageClick(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="px-3 py-1 rounded-sm border border-gray-800 disabled:opacity-50"
          >
            &gt;
          </button>
        </div>
      )}
    </div>
  );
};
