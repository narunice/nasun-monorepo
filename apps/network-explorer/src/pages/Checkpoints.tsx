import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getCheckpoints } from '../lib/sui-client';
import { formatTimestamp, truncateDigest, formatSoe, formatLastUpdated } from '../lib/format';
import { useCursorPagination, useMinDuration, useDocumentTitle } from '../hooks';
import { Card } from '../components/ui/Card';

export default function Checkpoints() {
  useDocumentTitle('Checkpoints');
  const { cursor, pageIndex, handleNextPage, handlePrevPage } = useCursorPagination<string>();

  const { data, isLoading, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ['checkpoints', cursor],
    queryFn: () => getCheckpoints(20, cursor),
    refetchInterval: 10000,
    staleTime: 8000,
  });

  const isFetchingExtended = useMinDuration(isFetching);

  return (
    <>
      <div className="mb-6">
        <Link to="/" className="text-primary hover:underline">
          &larr; Back to Home
        </Link>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground">Checkpoints</h1>
          {isFetchingExtended && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <span className="w-2 h-2 bg-primary rounded-full animate-pulse" />
              updating...
            </span>
          )}
        </div>
        {dataUpdatedAt && (
          <span className="text-xs text-muted-foreground">
            Last updated: {formatLastUpdated(new Date(dataUpdatedAt))}
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
                  <th className="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-muted-foreground">Sequence</th>
                  <th className="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-muted-foreground">Digest</th>
                  <th className="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-muted-foreground">Time</th>
                  <th className="px-4 py-3 text-right text-sm font-medium uppercase tracking-wider text-muted-foreground">Epoch</th>
                  <th className="px-4 py-3 text-right text-sm font-medium uppercase tracking-wider text-muted-foreground">TX Count</th>
                  <th className="px-4 py-3 text-right text-sm font-medium uppercase tracking-wider text-muted-foreground">Gas Used</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {data.data.map((checkpoint) => (
                  <tr key={checkpoint.sequenceNumber} className="hover:bg-muted/50 transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        to={`/checkpoint/${checkpoint.sequenceNumber}`}
                        className="font-mono text-sm text-foreground hover:text-primary hover:underline"
                      >
                        #{checkpoint.sequenceNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        to={`/checkpoint/${checkpoint.sequenceNumber}`}
                        className="font-mono text-sm text-foreground hover:text-primary hover:underline"
                      >
                        {truncateDigest(checkpoint.digest)}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-foreground text-sm">
                      {formatTimestamp(checkpoint.timestampMs)}
                    </td>
                    <td className="px-4 py-3 text-right text-foreground text-sm font-mono">
                      {checkpoint.epoch}
                    </td>
                    <td className="px-4 py-3 text-right text-foreground text-sm font-mono">
                      {checkpoint.transactions?.length || 0}
                    </td>
                    <td className="px-4 py-3 text-right text-foreground text-sm font-mono">
                      {formatSoe(checkpoint.epochRollingGasCostSummary?.computationCost)}
                    </td>
                  </tr>
                ))}
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
          No checkpoints found
        </Card>
      )}
    </>
  );
}
