import { Link } from 'react-router-dom';
import { SectionBox } from '../ui/SectionBox';
import { Badge } from '../ui/Badge';
import { truncateDigest, formatTimestamp } from '../../lib/format';
import type { SuiTransactionBlockResponse } from '@mysten/sui/client';

interface AddressTransactionHistoryProps {
  transactions: SuiTransactionBlockResponse[] | undefined;
  isLoading: boolean;
  limit?: number;
  onLoadMore?: () => void;
  hasMore?: boolean;
  viewerAddress?: string;
}

export default function AddressTransactionHistory({
  transactions,
  isLoading,
  onLoadMore,
  hasMore,
  viewerAddress,
}: AddressTransactionHistoryProps) {
  const viewerSuffix = viewerAddress ? `?viewer=${viewerAddress}` : '';
  return (
    <SectionBox title="Transaction History" color="c6">
      {isLoading ? (
        <div className="text-muted-foreground text-center py-8">Loading transactions...</div>
      ) : transactions && transactions.length > 0 ? (
        <>
          <div className="overflow-x-auto rounded-xl border border-border/20 bg-card/60 backdrop-blur-md">
            <table className="w-full">
              <thead className="bg-muted/50 border-b border-border/20">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-muted-foreground">
                    Digest
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-muted-foreground">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-muted-foreground">
                    Time
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-muted-foreground">
                    Checkpoint
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {transactions.map((tx) => (
                  <tr key={tx.digest} className="hover:bg-muted/50 transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        to={`/tx/${tx.digest}${viewerSuffix}`}
                        className="font-mono text-sm text-foreground hover:text-primary hover:underline"
                      >
                        {truncateDigest(tx.digest)}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={tx.effects?.status?.status === 'success' ? 'success' : 'error'}
                      >
                        {tx.effects?.status?.status || 'unknown'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-sm">
                      {formatTimestamp(tx.timestampMs)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground font-mono text-sm">
                      {tx.checkpoint || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {hasMore && onLoadMore && (
            <div className="mt-4 flex justify-center">
              <button
                onClick={onLoadMore}
                className="px-4 py-2 text-sm text-primary border border-primary/30 rounded-sm hover:bg-primary/10 transition-colors"
              >
                Load More (show 30 more)
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="text-muted-foreground text-center py-8">
          No transactions found for this address
        </div>
      )}
    </SectionBox>
  );
}
