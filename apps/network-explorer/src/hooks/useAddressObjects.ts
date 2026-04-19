import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getAddressInfo } from '../lib/sui-client';
import { isNFTObject } from '../lib/media';
import { parseContent } from '../lib/object-utils';
import type { SuiObjectResponse } from '@mysten/sui/client';

export function useAddressObjects(addr: string | undefined) {
  const { data: addressInfo, isLoading, error } = useQuery({
    queryKey: ['address', addr],
    queryFn: () => getAddressInfo(addr!),
    enabled: !!addr,
  });

  // Categorize objects into NFTs vs others
  const { nftObjects, otherObjects } = useMemo(() => {
    const nfts: SuiObjectResponse[] = [];
    const others: SuiObjectResponse[] = [];

    (addressInfo?.ownedObjects ?? []).forEach((obj) => {
      const content = parseContent(obj.data?.content);
      if (isNFTObject(obj.data?.display?.data, content)) {
        nfts.push(obj);
      } else {
        others.push(obj);
      }
    });

    return { nftObjects: nfts, otherObjects: others };
  }, [addressInfo?.ownedObjects]);

  return {
    addressInfo,
    nftObjects,
    otherObjects,
    isLoading,
    error,
    objectsHasMore: addressInfo?.objectsHasMore ?? false,
    objectsNextCursor: addressInfo?.objectsNextCursor ?? null,
  };
}
