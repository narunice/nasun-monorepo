import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getAddressInfo, loadMoreObjects, parseObjectContent } from '../lib/sui-client';
import { isNFTObject } from '../lib/media';
import type { SuiObjectResponse } from '@mysten/sui/client';
import type { AddressInfo } from '../lib/types';

export function useAddressObjects(addr: string | undefined) {
  const [accumulatedObjects, setAccumulatedObjects] = useState<SuiObjectResponse[]>([]);
  const [objectCursor, setObjectCursor] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const { data: addressInfo, isLoading, error } = useQuery({
    queryKey: ['address', addr],
    queryFn: () => getAddressInfo(addr!),
    enabled: !!addr,
  }) as { data: AddressInfo | undefined, isLoading: boolean, error: unknown };

  // Initialize accumulated objects when addressInfo changes
  useEffect(() => {
    if (addressInfo?.ownedObjects) {
      setAccumulatedObjects(addressInfo.ownedObjects);
      setObjectCursor(addressInfo.nextCursor || null);
    }
  }, [addressInfo]);

  // Reset state when address changes
  useEffect(() => {
    setAccumulatedObjects([]);
    setObjectCursor(null);
  }, [addr]);

  // Load more objects handler
  const handleLoadMore = useCallback(async () => {
    if (!addr || !objectCursor || isLoadingMore) return;

    setIsLoadingMore(true);
    try {
      const result = await loadMoreObjects(addr, objectCursor);
      if (result) {
        setAccumulatedObjects((prev) => {
          const existingIds = new Set(prev.map((o) => o.data?.objectId));
          const newObjects = result.ownedObjects.filter((o) => !existingIds.has(o.data?.objectId));
          return [...prev, ...newObjects];
        });
        setObjectCursor(result.nextCursor || null);
      }
    } finally {
      setIsLoadingMore(false);
    }
  }, [addr, objectCursor, isLoadingMore]);

  // Categorize objects
  const { nftObjects, otherObjects } = useMemo(() => {
    const nfts: SuiObjectResponse[] = [];
    const others: SuiObjectResponse[] = [];

    accumulatedObjects.forEach((obj) => {
      const content = parseObjectContent(obj.data?.content);
      if (isNFTObject(obj.data?.display?.data, content)) {
        nfts.push(obj);
      } else {
        others.push(obj);
      }
    });

    return { nftObjects: nfts, otherObjects: others };
  }, [accumulatedObjects]);

  const hasNextPage = objectCursor !== null;

  return {
    addressInfo,
    accumulatedObjects,
    nftObjects,
    otherObjects,
    isLoading,
    error,
    isLoadingMore,
    hasNextPage,
    handleLoadMore,
  };
}
