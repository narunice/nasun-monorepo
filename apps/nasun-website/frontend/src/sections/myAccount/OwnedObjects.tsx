// OwnedObjects.tsx
// Multi-chain NFT thumbnail gallery + Sui objects display
// NFT data is received as props from AssetsCard (which handles featured/regular splitting).

import { useMemo, useState, useEffect } from "react";
import { useWalletAccount } from "@nasun/wallet";
import { useSuiClient } from "@mysten/dapp-kit";
import { useInfiniteQuery } from "@tanstack/react-query";
import type { EthereumNFT } from "@/types/ethereum";
import type { RegisteredWallet } from "@/services/suiWalletApi";
import { SuiObject } from "./SuiObjects";
import { NftThumbnailGallery } from "./components/NftThumbnailGallery";
import type { SuiObjectResponse } from "@mysten/sui/client";

interface OwnedObjectsProps {
  nfts: EthereumNFT[] | undefined;
  isNftPending: boolean;
  nftError: Error | null;
  hasFeaturedNfts: boolean;
  walletAddress?: string;
  registeredWallets?: RegisteredWallet[];
}

type CursorMap = Record<string, string | null>;

export const OwnedObjects = ({
  nfts,
  isNftPending,
  nftError,
  hasFeaturedNfts,
  walletAddress,
  registeredWallets = [],
}: OwnedObjectsProps) => {
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  const suiClient = useSuiClient();

  // Collect all unique Sui addresses: active wallet + registered wallets
  const suiAccount = useWalletAccount();
  const allAddresses = useMemo(() => {
    const addrs = new Set<string>();
    if (suiAccount?.address) addrs.add(suiAccount.address);
    for (const w of registeredWallets) {
      addrs.add(w.walletAddress);
    }
    return Array.from(addrs);
  }, [suiAccount?.address, registeredWallets]);

  const filterStrings = import.meta.env.VITE_FILTER_STRINGS?.split(",") || [];

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isPending: isSuiPending,
    error: suiError,
  } = useInfiniteQuery({
    queryKey: ["owned-objects", allAddresses, filterStrings],
    enabled: allAddresses.length > 0,
    queryFn: async ({ pageParam }) => {
      const cursorMap = pageParam as CursorMap | null;
      const results = await Promise.all(
        allAddresses.map((addr) =>
          suiClient.getOwnedObjects({
            owner: addr,
            options: {
              showType: true,
              showOwner: true,
              showContent: true,
              showDisplay: true,
            },
            limit: 50,
            cursor: cursorMap?.[addr] ?? undefined,
          })
        )
      );
      return results;
    },
    initialPageParam: null as CursorMap | null,
    getNextPageParam: (lastPage) => {
      const cursors: CursorMap = {};
      let anyHasMore = false;
      lastPage.forEach((result, i) => {
        const addr = allAddresses[i];
        cursors[addr] = result.nextCursor ?? null;
        if (result.hasNextPage) anyHasMore = true;
      });
      return anyHasMore ? cursors : undefined;
    },
    staleTime: 30_000,
  });

  // Flatten and deduplicate objects from all pages
  const suiObjects = useMemo(() => {
    const seen = new Set<string>();
    const objects: SuiObjectResponse[] = [];
    for (const page of data?.pages ?? []) {
      for (const result of page) {
        for (const obj of result.data ?? []) {
          const id = obj.data?.objectId;
          if (!id || seen.has(id)) continue;
          if (!obj.data?.type || !filterStrings.some((f: string) => obj.data?.type!.includes(f))) continue;
          seen.add(id);
          objects.push(obj);
        }
      }
    }
    return objects;
  }, [data?.pages, filterStrings]);

  // Reset page when allAddresses changes (wallet connect/disconnect)
  useEffect(() => {
    setCurrentPage(1);
  }, [allAddresses]);

  const hasAddresses = allAddresses.length > 0;
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
        <p className="pt-4 text-gray-300">No objects found.</p>
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
      {hasAddresses && (
        <div>
          {isSuiPending ? (
            <p className="text-gray-300">Loading...</p>
          ) : suiError ? (
            <p className="text-nasun-white">
              Error loading Sui objects: {(suiError as Error).message}
            </p>
          ) : paginatedSuiObjects.length > 0 ? (
            <>
              <h6 className="font-semibold mb-4 text-gray-200">
                Nasun Objects ({suiObjects.length}{hasNextPage ? "+" : ""})
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

      {/* Load More (fetches next cursor page from RPC) */}
      {hasNextPage && (
        <div className="flex justify-center pt-2">
          <button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="px-4 py-2 rounded-sm border border-gray-800 disabled:opacity-50 text-sm text-gray-300"
          >
            {isFetchingNextPage ? "Loading..." : "Load More"}
          </button>
        </div>
      )}
    </div>
  );
};
