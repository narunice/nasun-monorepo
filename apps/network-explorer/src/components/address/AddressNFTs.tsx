import { SectionBox } from '../ui/SectionBox';
import NFTCard from '../NFTCard';
import { parseContent } from '../../lib/object-utils';
import type { SuiObjectResponse } from '@mysten/sui/client';

interface AddressNFTsProps {
  nftObjects: SuiObjectResponse[];
}

export default function AddressNFTs({ nftObjects }: AddressNFTsProps) {
  if (nftObjects.length === 0) return null;

  return (
    <SectionBox title={`NFTs (${nftObjects.length})`} color="c4">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {nftObjects.map((obj, idx) => (
          <NFTCard
            key={obj.data?.objectId ?? idx}
            objectId={obj.data?.objectId ?? ''}
            type={obj.data?.type ?? undefined}
            display={obj.data?.display?.data}
            content={parseContent(obj.data?.content)}
          />
        ))}
      </div>
    </SectionBox>
  );
}
