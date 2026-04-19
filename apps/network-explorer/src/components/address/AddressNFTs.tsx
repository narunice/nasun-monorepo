import { useState, useMemo, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SectionBox } from '../ui/SectionBox';
import NFTCard from '../NFTCard';
import { parseContent } from '../../lib/object-utils';
import { isNFTObject } from '../../lib/media';
import { useCursorPagination } from '../../hooks/useCursorPagination';
import { getOwnedObjectsPage } from '../../lib/sui-client';
import type { SuiObjectResponse } from '@mysten/sui/client';

const NFT_PAGE_SIZE = 12;

interface AddressNFTsProps {
  nftObjects: SuiObjectResponse[];
  objectsHasMore: boolean;
  objectsNextCursor: string | null;
  address: string;
}

export default function AddressNFTs({
  nftObjects,
  objectsHasMore,
  objectsNextCursor,
  address,
}: AddressNFTsProps) {
  const { cursor, pageIndex, handleNextPage, handlePrevPage } = useCursorPagination<string>();
  const [extraObjects, setExtraObjects] = useState<SuiObjectResponse[]>([]);
  const [lastFetchedCursor, setLastFetchedCursor] = useState<string | null>(objectsNextCursor);
  const [hasMoreExtra, setHasMoreExtra] = useState(objectsHasMore);
  const [isFetchingMore, setIsFetchingMore] = useState(false);

  // Query for additional pages (beyond initial 500)
  const { data: pageData, isLoading: isPageLoading } = useQuery({
    queryKey: ['address-nfts-page', address, cursor],
    queryFn: () => getOwnedObjectsPage(address, cursor),
    enabled: !!cursor,
  });

  // Collect extra NFT objects from cursor-based page queries
  const extraNftObjects = useMemo(() => {
    if (!pageData) return [];
    return pageData.objects.filter(obj =>
      isNFTObject(obj.data?.display?.data, parseContent(obj.data?.content))
    );
  }, [pageData]);

  // All NFTs: initial (from useAddressObjects) + extra pages via cursor
  const allNftObjects = useMemo(() => {
    const seen = new Set<string>();
    const all: SuiObjectResponse[] = [];
    for (const obj of [...nftObjects, ...extraObjects]) {
      const id = obj.data?.objectId;
      if (id && !seen.has(id)) {
        seen.add(id);
        all.push(obj);
      }
    }
    return all;
  }, [nftObjects, extraObjects]);

  // UI pagination over allNftObjects
  const [uiPage, setUiPage] = useState(1);
  const totalUiPages = Math.ceil(allNftObjects.length / NFT_PAGE_SIZE);
  const pagedNFTs = allNftObjects.slice((uiPage - 1) * NFT_PAGE_SIZE, uiPage * NFT_PAGE_SIZE);

  const loadMore = useCallback(async () => {
    if (!lastFetchedCursor || isFetchingMore) return;
    setIsFetchingMore(true);
    try {
      const result = await getOwnedObjectsPage(address, lastFetchedCursor);
      setExtraObjects(prev => [...prev, ...result.objects]);
      setLastFetchedCursor(result.nextCursor);
      setHasMoreExtra(result.hasNextPage);
    } finally {
      setIsFetchingMore(false);
    }
  }, [address, lastFetchedCursor, isFetchingMore]);

  // When current UI page is empty but more data may exist, auto-advance
  useEffect(() => {
    if (pagedNFTs.length === 0 && hasMoreExtra && !isFetchingMore) {
      loadMore();
    }
  }, [pagedNFTs.length, hasMoreExtra, isFetchingMore, loadMore]);

  if (allNftObjects.length === 0 && !objectsHasMore && !isPageLoading) return null;

  const showLoadMore = hasMoreExtra && pagedNFTs.length > 0;

  return (
    <SectionBox title={`NFTs (${allNftObjects.length}${hasMoreExtra ? '+' : ''})`} color="c4">
      {isPageLoading ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : pagedNFTs.length === 0 ? (
        <p className="text-sm text-gray-400">No NFTs on this page.</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {pagedNFTs.map((obj, idx) => (
            <NFTCard
              key={obj.data?.objectId ?? idx}
              objectId={obj.data?.objectId ?? ''}
              type={obj.data?.type ?? undefined}
              display={obj.data?.display?.data}
              content={parseContent(obj.data?.content)}
            />
          ))}
        </div>
      )}

      {/* UI pagination */}
      {totalUiPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            onClick={() => setUiPage(p => Math.max(1, p - 1))}
            disabled={uiPage === 1}
            className="px-3 py-1.5 text-sm rounded border border-nasun-c4/30 disabled:opacity-40 hover:bg-nasun-c4/10 text-gray-300 transition-colors"
          >
            Prev
          </button>
          <span className="text-sm text-gray-400">{uiPage} / {totalUiPages}</span>
          <button
            onClick={() => setUiPage(p => Math.min(totalUiPages, p + 1))}
            disabled={uiPage === totalUiPages}
            className="px-3 py-1.5 text-sm rounded border border-nasun-c4/30 disabled:opacity-40 hover:bg-nasun-c4/10 text-gray-300 transition-colors"
          >
            Next
          </button>
        </div>
      )}

      {/* Load More (fetches beyond initial 500) */}
      {showLoadMore && (
        <div className="flex justify-center mt-3">
          <button
            onClick={loadMore}
            disabled={isFetchingMore}
            className="px-4 py-2 text-sm rounded border border-nasun-c4/30 disabled:opacity-50 hover:bg-nasun-c4/10 text-gray-300 transition-colors"
          >
            {isFetchingMore ? 'Loading...' : 'Load More'}
          </button>
        </div>
      )}
    </SectionBox>
  );
}
