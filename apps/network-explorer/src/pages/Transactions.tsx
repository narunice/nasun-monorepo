import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { suiClient } from '../lib/sui-client';
import { formatTimestamp, truncateDigest, getTxTypeInfo } from '../lib/format';
import { useCursorPagination, useDocumentTitle } from '../hooks';
import { Badge } from '../components/ui/Badge';
import { Card } from '../components/ui/Card';

export default function Transactions() {
  useDocumentTitle('Transactions');
  const { cursor, pageIndex, handleNextPage, handlePrevPage } = useCursorPagination<string>();

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['transactions', cursor],
    queryFn: async () => {
      const result = await suiClient.queryTransactionBlocks({
        options: {
          showEffects: true,
          showInput: true,
        },
        limit: 20,
        cursor: cursor || undefined,
        order: 'descending',
      });
      return result;
    },
  });

  return (
    <>
      <div className="mb-6">
        <Link to="/" className="text-primary hover:underline">
          &larr; Back to Home
        </Link>
      </div>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">Transactions</h1>
        {isFetching && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <span className="w-2 h-2 bg-primary rounded-full animate-pulse" />
            loading...
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="text-muted-foreground">Loading...</div>
      ) : data?.data && data.data.length > 0 ? (
        <>
          <div className="rounded-xl overflow-hidden border border-border/20 bg-card/60 backdrop-blur-md">
            <table className="w-full">
              <thead className="bg-muted/50 border-b border-border/20">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-muted-foreground">Digest</th>
                  <th className="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-muted-foreground">Type</th>
                  <th className="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-muted-foreground">Time</th>
                  <th className="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-muted-foreground">Checkpoint</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {data.data.map((tx) => {
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
                    <td className="px-4 py-3">
                      <Badge variant={tx.effects?.status?.status === 'success' ? 'success' : 'error'}>
                        {tx.effects?.status?.status || 'unknown'}
                      </Badge>
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

          {/* Pagination */}
          <div className="flex items-center justify-between mt-4">
            <button
              onClick={handlePrevPage}
              disabled={pageIndex === 0}
              className="px-4 py-2 bg-card border border-border hover:bg-primary/10 disabled:bg-muted disabled:text-muted-foreground disabled:border-border/50 rounded-xl transition-all active:scale-[0.97] text-foreground"
            >
              &larr; Previous
            </button>
            <span className="text-muted-foreground">Page {pageIndex + 1}</span>
            <button
              onClick={() => data?.nextCursor && handleNextPage(data.nextCursor)}
              disabled={!data?.hasNextPage}
              className="px-4 py-2 bg-card border border-border hover:bg-primary/10 disabled:bg-muted disabled:text-muted-foreground disabled:border-border/50 rounded-xl transition-all active:scale-[0.97] text-foreground"
            >
              Next &rarr;
            </button>
          </div>
        </>
      ) : (
        <Card variant="default" className="p-8 text-center text-muted-foreground">
          No transactions found
        </Card>
      )}
    </>
  );
}
