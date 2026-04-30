// UjuOwnedObjects.tsx
// Multi-chain NFT thumbnail gallery + Sui objects display for Uju section.

import { useMemo, useState, useEffect } from "react";
import { useWalletAccount } from "@nasun/wallet";
import { useSuiClient } from "@mysten/dapp-kit";
import { useInfiniteQuery } from "@tanstack/react-query";
import type { EthereumNFT } from "@/types/ethereum";
import type { RegisteredWallet } from "@/services/suiWalletApi";
import { UjuSuiObject } from "./UjuSuiObjects";
import { UjuNftThumbnailGallery } from "./UjuNftThumbnailGallery";
import type { SuiObjectResponse } from "@mysten/sui/client";
import { UjuButton } from "../../shared";

interface UjuOwnedObjectsProps {
  nfts: EthereumNFT[] | undefined;
  isNftPending: boolean;
  nftError: Error | null;
  hasFeaturedNfts: boolean;
  walletAddress?: string;
  registeredWallets?: RegisteredWallet[];
}

type CursorMap = Record<string, string | null>;

export const UjuOwnedObjects = ({
  nfts,
  isNftPending,
  nftError,
  hasFeaturedNfts,
  walletAddress,
  registeredWallets = [],
}: UjuOwnedObjectsProps) => {
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  const suiClient = useSuiClient();

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
    queryKey: ["owned-objects-uju", allAddresses, filterStrings],
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

  useEffect(() => {
    setCurrentPage(1);
  }, [allAddresses]);

  const hasAddresses = allAddresses.length > 0;
  const nftCount = nfts?.length ?? 0;
  const hasNoAssets =
    suiObjects.length === 0 && nftCount === 0 && !hasFeaturedNfts && !isNftPending && !isSuiPending;

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
    <div className="flex flex-col space-y-8">
      {hasNoAssets && (
        <p className="text-uju-secondary font-light">No objects found.</p>
      )}

      {/* Ethereum & Polygon NFTs (non-featured) */}
      {walletAddress && (
        <UjuNftThumbnailGallery
          nfts={nfts}
          isLoading={isNftPending}
          error={nftError}
        />
      )}

      {/* Sui Objects */}
      {hasAddresses && (
        <div className="space-y-4">
          {isSuiPending ? (
            <p className="text-uju-secondary">Loading objects...</p>
          ) : suiError ? (
            <p className="text-red-400">
              Error loading Sui objects: {(suiError as Error).message}
            </p>
          ) : paginatedSuiObjects.length > 0 ? (
            <>
              <h6 className="text-sm font-normal text-uju-primary uppercase tracking-wider mb-2">
                Nasun Objects ({suiObjects.length}{hasNextPage ? "+" : ""})
              </h6>
              <div className="grid gap-4">
                {paginatedSuiObjects.map((objectRes) => (
                  <UjuSuiObject key={`sui-${objectRes.data?.objectId}`} objectRes={objectRes} />
                ))}
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* Sui Pagination */}
      {suiObjects.length > itemsPerPage && (
        <div className="flex justify-center items-center gap-2">
          <UjuButton
            size="sm"
            variant="secondary"
            onClick={() => handlePageClick(currentPage - 1)}
            disabled={currentPage === 1}
            className="w-10 h-10 p-0 flex items-center justify-center"
          >
            &lt;
          </UjuButton>

          <div className="flex items-center gap-1.5">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <button
                key={page}
                onClick={() => handlePageClick(page)}
                className={`w-10 h-10 rounded-xl font-normal transition-all duration-200 ${
                  currentPage === page
                    ? "bg-pado-2 text-uju-bg shadow-lg shadow-pado-2/20"
                    : "bg-uju-bg border border-uju-border/30 text-uju-secondary hover:border-pado-2/50"
                }`}
              >
                {page}
              </button>
            ))}
          </div>

          <UjuButton
            size="sm"
            variant="secondary"
            onClick={() => handlePageClick(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="w-10 h-10 p-0 flex items-center justify-center"
          >
            &gt;
          </UjuButton>
        </div>
      )}

      {/* Load More (fetches next cursor page from RPC) */}
      {hasNextPage && (
        <div className="flex justify-center pt-2">
          <UjuButton
            variant="secondary"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="gap-2"
          >
            {isFetchingNextPage && <div className="w-3 h-3 border-2 border-uju-secondary/60 border-t-transparent rounded-full animate-spin" />}
            {isFetchingNextPage ? "Fetching..." : "Load More Objects"}
          </UjuButton>
        </div>
      )}
    </div>
  );
};
