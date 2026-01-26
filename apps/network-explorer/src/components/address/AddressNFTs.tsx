import { SectionBox } from '../ui/SectionBox';
import NFTCard from '../NFTCard';
import { parseObjectContent } from '../../lib/sui-client';
import type { SuiObjectResponse } from '@mysten/sui/client';

interface AddressNFTsProps {
  nftObjects: SuiObjectResponse[];
  hasNextPage: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
}

export default function AddressNFTs({
  nftObjects,
  hasNextPage,
  isLoadingMore,
  onLoadMore,
}: AddressNFTsProps) {
  if (nftObjects.length === 0) return null;

  return (
    <SectionBox title={`NFTs (${nftObjects.length}${hasNextPage ? '+' : ''})`} color="c4">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {nftObjects.map((obj, idx) => (
          <NFTCard
            key={obj.data?.objectId ?? idx}
            objectId={obj.data?.objectId ?? ''}
            type={obj.data?.type ?? undefined}
            display={obj.data?.display?.data}
            content={parseObjectContent(obj.data?.content)}
          />
        ))}
      </div>
      {hasNextPage && (
        <button
          onClick={onLoadMore}
          disabled={isLoadingMore}
          className="w-full mt-4 py-2 text-primary hover:bg-primary/10 rounded border border-primary/30 transition-colors disabled:opacity-50"
        >
          {isLoadingMore ? 'Loading...' : 'Load More Objects'}
        </button>
      )}
    </SectionBox>
  );
}
