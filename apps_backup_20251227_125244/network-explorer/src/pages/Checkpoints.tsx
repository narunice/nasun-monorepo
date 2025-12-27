import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getCheckpoints } from '../lib/sui-client';
import { formatSoe } from '../lib/format';
import { Card } from '../components/ui/Card';

function formatTimestamp(timestampMs: string | number | null | undefined) {
  if (!timestampMs) return '-';
  const date = new Date(Number(timestampMs));
  return date.toLocaleString('en-US');
}

function truncateDigest(digest: string) {
  return `${digest.slice(0, 8)}...${digest.slice(-6)}`;
}

export default function Checkpoints() {
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [cursorHistory, setCursorHistory] = useState<(string | undefined)[]>([undefined]);
  const [pageIndex, setPageIndex] = useState(0);

  const { data, isLoading, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ['checkpoints', cursor],
    queryFn: () => getCheckpoints(20, cursor),
    refetchInterval: 10000,
    staleTime: 8000,
  });

  const handleNextPage = () => {
    if (data?.hasNextPage && data?.nextCursor) {
      const newHistory = [...cursorHistory];
      if (pageIndex + 1 >= newHistory.length) {
        newHistory.push(data.nextCursor);
        setCursorHistory(newHistory);
      }
      setPageIndex(pageIndex + 1);
      setCursor(data.nextCursor);
    }
  };

  const handlePrevPage = () => {
    if (pageIndex > 0) {
      setPageIndex(pageIndex - 1);
      setCursor(cursorHistory[pageIndex - 1]);
    }
  };

  const formatLastUpdated = (date: Date) => {
    return date.toLocaleTimeString('en-US', { hour12: true });
  };

  return (
    <>
      <div className="mb-6">
        <Link to="/" className="text-nasun-c4 hover:underline">
          &larr; Back to Home
        </Link>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Checkpoints</h1>
          {isFetching && (
            <span className="flex items-center gap-1 text-xs text-nasun-white/60">
              <span className="w-2 h-2 bg-nasun-c4 rounded-full animate-pulse" />
              updating...
            </span>
          )}
        </div>
        {dataUpdatedAt && (
          <span className="text-xs text-slate-500">
            Last updated: {formatLastUpdated(new Date(dataUpdatedAt))}
          </span>
        )}
      </div>

        {isLoading ? (
          <div className="text-nasun-white/60">Loading...</div>
        ) : data?.data && data.data.length > 0 ? (
          <>
            <div className="rounded-xl overflow-hidden border border-nasun-c4/50 bg-nasun-c6/80 backdrop-blur-md">
              <table className="w-full">
                <thead className="bg-nasun-c6/80 border-b border-nasun-c4/30">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-nasun-white/80">Sequence</th>
                    <th className="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-nasun-white/80">Digest</th>
                    <th className="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-nasun-white/80">Time</th>
                    <th className="px-4 py-3 text-right text-sm font-medium uppercase tracking-wider text-nasun-white/80">Epoch</th>
                    <th className="px-4 py-3 text-right text-sm font-medium uppercase tracking-wider text-nasun-white/80">TX Count</th>
                    <th className="px-4 py-3 text-right text-sm font-medium uppercase tracking-wider text-nasun-white/80">Gas Used</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-nasun-c4/20">
                  {data.data.map((checkpoint) => (
                    <tr key={checkpoint.sequenceNumber} className="hover:bg-nasun-c4/10 transition-colors">
                      <td className="px-4 py-3">
                        <Link
                          to={`/checkpoint/${checkpoint.sequenceNumber}`}
                          className="font-mono text-nasun-c4 hover:underline"
                        >
                          #{checkpoint.sequenceNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          to={`/checkpoint/${checkpoint.sequenceNumber}`}
                          className="font-mono text-sm text-nasun-white/60 hover:text-nasun-white hover:underline"
                        >
                          {truncateDigest(checkpoint.digest)}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-nasun-white/60 text-sm">
                        {formatTimestamp(checkpoint.timestampMs)}
                      </td>
                      <td className="px-4 py-3 text-right text-nasun-white/60 font-mono">
                        {checkpoint.epoch}
                      </td>
                      <td className="px-4 py-3 text-right text-nasun-white/80 font-mono">
                        {checkpoint.transactions?.length || 0}
                      </td>
                      <td className="px-4 py-3 text-right text-nasun-white/60 font-mono text-sm">
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
                className="px-4 py-2 bg-nasun-c6/80 border border-nasun-c4/50 hover:bg-nasun-c4/20 disabled:bg-nasun-c6/40 disabled:text-nasun-white/30 disabled:border-nasun-c5/20 rounded-xl transition-all active:scale-[0.97]"
              >
                &larr; Previous
              </button>
              <span className="text-nasun-white/60">Page {pageIndex + 1}</span>
              <button
                onClick={handleNextPage}
                disabled={!data?.hasNextPage}
                className="px-4 py-2 bg-nasun-c6/80 border border-nasun-c4/50 hover:bg-nasun-c4/20 disabled:bg-nasun-c6/40 disabled:text-nasun-white/30 disabled:border-nasun-c5/20 rounded-xl transition-all active:scale-[0.97]"
              >
                Next &rarr;
              </button>
            </div>
          </>
        ) : (
          <Card variant="c6" className="p-8 text-center text-nasun-white/60">
            No checkpoints found
          </Card>
        )}
    </>
  );
}
