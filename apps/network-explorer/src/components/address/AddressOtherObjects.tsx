import { Link } from 'react-router-dom';
import { SectionBox } from '../ui/SectionBox';
import { truncateId, formatObjectType } from '../../lib/format';
import type { SuiObjectResponse } from '@mysten/sui/client';

interface AddressOtherObjectsProps {
  otherObjects: SuiObjectResponse[];
  hasNextPage: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
}

export default function AddressOtherObjects({
  otherObjects,
  hasNextPage,
  isLoadingMore,
  onLoadMore,
}: AddressOtherObjectsProps) {
  return (
    <SectionBox
      title={`Other Objects (${otherObjects.length}${hasNextPage ? '+' : ''})`}
      color="c6"
    >
      {otherObjects.length > 0 ? (
        <>
          <div className="overflow-x-auto rounded-lg border border-border/20 bg-card/60 backdrop-blur-md">
            <table className="w-full">
              <thead className="bg-muted/50 border-b border-border/20">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-muted-foreground">
                    Object ID
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-muted-foreground">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-muted-foreground">
                    Version
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {otherObjects.map((obj, idx) => (
                  <tr key={obj.data?.objectId ?? idx} className="hover:bg-muted/50 transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        to={`/object/${obj.data?.objectId}`}
                        className="font-mono text-sm text-primary hover:underline"
                      >
                        {truncateId(obj.data?.objectId ?? '')}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-sm max-w-xs truncate">
                      {formatObjectType(obj.data?.type ?? undefined)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground font-mono">
                      {obj.data?.version || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
        </>
      ) : (
        <div className="text-muted-foreground text-center py-8">
          No objects owned by this address
        </div>
      )}
    </SectionBox>
  );
}
