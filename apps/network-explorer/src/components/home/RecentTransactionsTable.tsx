import { Link } from 'react-router-dom';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { truncateDigest, formatTimestamp, formatLastUpdated, getTxTypeInfo } from '../../lib/format';
import type { SuiTransactionBlockResponse } from '@mysten/sui/client';

interface RecentTransactionsTableProps {
  transactions: SuiTransactionBlockResponse[] | undefined;
  isLoading: boolean;
  isFetching: boolean;
  updatedAt: number | undefined;
}

export default function RecentTransactionsTable({
  transactions,
  isLoading,
  isFetching,
  updatedAt,
}: RecentTransactionsTableProps) {
  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold text-foreground">Recent Transactions</h2>
          {isFetching && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <span className="w-2 h-2 bg-primary rounded-full animate-pulse" />
              updating...
            </span>
          )}
        </div>
        {updatedAt && (
          <span className="text-xs text-muted-foreground">
            Last updated: {formatLastUpdated(new Date(updatedAt))}
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="text-muted-foreground">Loading...</div>
      ) : transactions && transactions.length > 0 ? (
        <div className="rounded-xl overflow-hidden border border-border/20 bg-card/60 shadow-sm backdrop-blur-md">
          <table className="w-full">
            <thead className="bg-muted/50 border-b border-border/20">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-muted-foreground">
                  Digest
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-muted-foreground">
                  Type
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
              {transactions.map((tx) => {
                const typeInfo = getTxTypeInfo(tx);
                return (
                <tr key={tx.digest} className="hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-3">
                    <Link
                      to={`/tx/${tx.digest}`}
                      className="font-mono text-sm text-foreground hover:text-primary hover:underline"
                    >
                      {truncateDigest(tx.digest)}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={typeInfo.variant}>{typeInfo.label}</Badge>
                  </td>
                  <td className="px-4 py-3 text-foreground text-sm">
                    {formatTimestamp(tx.timestampMs)}
                  </td>
                  <td className="px-4 py-3 text-foreground text-sm font-mono">
                    {tx.checkpoint || '-'}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <Card variant="default" className="p-8 text-center text-muted-foreground">
          No transactions found
        </Card>
      )}
    </section>
  );
}
