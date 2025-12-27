import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getNetworkStatus, getRecentTransactions, getObject, getEpochInfo, getTPS } from '../lib/sui-client';
import { Link } from 'react-router-dom';
import { Card } from '../components/ui/Card';

function formatTimestamp(timestampMs: string | number | null | undefined) {
  if (!timestampMs) return '-';
  const date = new Date(Number(timestampMs));
  return date.toLocaleString('en-US');
}

function truncateDigest(digest: string) {
  return `${digest.slice(0, 8)}...${digest.slice(-6)}`;
}

function formatLastUpdated(date: Date | undefined) {
  if (!date) return '';
  return date.toLocaleTimeString('en-US', { hour12: true });
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

export default function Home() {
  const { data: networkStatus, isLoading: statusLoading, dataUpdatedAt: statusUpdatedAt, isFetching: statusFetching } = useQuery({
    queryKey: ['networkStatus'],
    queryFn: getNetworkStatus,
    refetchInterval: 5000,
    staleTime: 4000,
  });

  const { data: epochInfo, isFetching: epochFetching } = useQuery({
    queryKey: ['epochInfo'],
    queryFn: getEpochInfo,
    refetchInterval: 5000,
    staleTime: 4000,
  });

  const { data: tps, isFetching: tpsFetching } = useQuery({
    queryKey: ['tps'],
    queryFn: getTPS,
    refetchInterval: 10000,
    staleTime: 8000,
  });

  const { data: recentTxs, isLoading: txLoading, dataUpdatedAt: txUpdatedAt, isFetching: txFetching } = useQuery({
    queryKey: ['recentTransactions'],
    queryFn: () => getRecentTransactions(10),
    refetchInterval: 10000,
    staleTime: 8000,
  });

  const isAnyFetching = statusFetching || epochFetching || tpsFetching;

  return (
    <>
      {/* Network Status */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold">Network Status</h2>
            {isAnyFetching && (
              <span className="flex items-center gap-1 text-xs text-slate-400">
                <span className="w-2 h-2 bg-nasun-c4 rounded-full animate-pulse" />
                updating...
              </span>
            )}
          </div>
          {statusUpdatedAt && (
            <span className="text-xs text-slate-500">
              Last updated: {formatLastUpdated(new Date(statusUpdatedAt))}
            </span>
          )}
        </div>
        {statusLoading ? (
          <div className="text-slate-400">Loading...</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <Card variant="c4" className="p-4">
              <div className="text-nasun-white/60 text-sm uppercase tracking-wider">Status</div>
              <div className={`text-lg font-semibold ${networkStatus?.isConnected ? 'text-green-400' : 'text-red-400'}`}>
                {networkStatus?.isConnected ? 'Connected' : 'Disconnected'}
              </div>
            </Card>
            <Card variant="c4" className="p-4">
              <div className="text-nasun-white/60 text-sm uppercase tracking-wider">Chain ID</div>
              <div className="text-lg font-mono text-nasun-white">{networkStatus?.chainId || '-'}</div>
            </Card>
            <Card variant="c4" className="p-4">
              <div className="text-nasun-white/60 text-sm uppercase tracking-wider">Epoch</div>
              <div className="text-lg font-mono text-nasun-white">{epochInfo?.epoch || '-'}</div>
              <div className="text-xs text-nasun-white/40">
                {epochInfo?.remainingMs ? `${formatDuration(epochInfo.remainingMs)} left` : '-'}
              </div>
            </Card>
            <Card variant="c4" className="p-4">
              <div className="text-nasun-white/60 text-sm uppercase tracking-wider">Checkpoint</div>
              <div className="text-lg font-mono text-nasun-white">{networkStatus?.latestCheckpoint || '-'}</div>
            </Card>
            <Card variant="c4" className="p-4">
              <div className="text-nasun-white/60 text-sm uppercase tracking-wider">TPS</div>
              <div className="text-lg font-mono text-nasun-white">
                {tps !== null && tps !== undefined ? `${tps} tx/s` : '-'}
              </div>
            </Card>
            <Card variant="c4" className="p-4">
              <div className="text-nasun-white/60 text-sm uppercase tracking-wider">Gas Price</div>
              <div className="text-lg font-mono text-nasun-white">{networkStatus?.referenceGasPrice || '-'} SOE</div>
            </Card>
          </div>
        )}
      </section>

      {/* Search Bar */}
      <section className="mb-8">
        <SearchBar />
      </section>

      {/* Recent Transactions */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold">Recent Transactions</h2>
            {txFetching && (
              <span className="flex items-center gap-1 text-xs text-slate-400">
                <span className="w-2 h-2 bg-nasun-c4 rounded-full animate-pulse" />
                updating...
              </span>
            )}
          </div>
          {txUpdatedAt && (
            <span className="text-xs text-slate-500">
              Last updated: {formatLastUpdated(new Date(txUpdatedAt))}
            </span>
          )}
        </div>
        {txLoading ? (
          <div className="text-nasun-white/60">Loading...</div>
        ) : recentTxs && recentTxs.length > 0 ? (
          <div className="rounded-xl overflow-hidden border border-nasun-c4/50 bg-nasun-c6/80 backdrop-blur-md">
            <table className="w-full">
              <thead className="bg-nasun-c6/80 border-b border-nasun-c4/30">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-nasun-white/80">Digest</th>
                  <th className="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-nasun-white/80">Time</th>
                  <th className="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-nasun-white/80">Checkpoint</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-nasun-c4/20">
                {recentTxs.map((tx) => (
                  <tr key={tx.digest} className="hover:bg-nasun-c4/10 transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        to={`/tx/${tx.digest}`}
                        className="font-mono text-nasun-white/80 hover:text-nasun-white hover:underline"
                      >
                        {truncateDigest(tx.digest)}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-nasun-white/60 text-sm">
                      {formatTimestamp(tx.timestampMs)}
                    </td>
                    <td className="px-4 py-3 text-nasun-white/60 font-mono">
                      {tx.checkpoint || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Card variant="c6" className="p-8 text-center text-nasun-white/60">
            No transactions found
          </Card>
        )}
      </section>
    </>
  );
}

function SearchBar() {
  const [isSearching, setIsSearching] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const query = formData.get('query') as string;

    if (!query.trim()) return;

    // Detect type and redirect
    if (query.length === 44 || query.length === 43) {
      // Transaction digest (base58)
      window.location.href = `/tx/${query}`;
    } else if (query.startsWith('0x') && query.length === 66) {
      // Could be object ID or address - check if object exists
      setIsSearching(true);
      try {
        const obj = await getObject(query);
        if (obj?.data) {
          window.location.href = `/object/${query}`;
        } else {
          window.location.href = `/address/${query}`;
        }
      } catch {
        // On error, default to address
        window.location.href = `/address/${query}`;
      } finally {
        setIsSearching(false);
      }
    } else if (query.startsWith('0x') && query.length === 42) {
      // Address (shorter format)
      window.location.href = `/address/${query}`;
    } else {
      // Default to object
      window.location.href = `/object/${query}`;
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        type="text"
        name="query"
        placeholder="Search by Transaction Digest, Object ID, or Address"
        className="flex-1 bg-nasun-c6/80 border border-nasun-c4/50 rounded-xl px-4 py-3 text-nasun-white placeholder-nasun-white/40 focus:outline-none focus:border-nasun-c4 backdrop-blur-md transition-colors"
        disabled={isSearching}
      />
      <button
        type="submit"
        disabled={isSearching}
        className="bg-nasun-c4 hover:bg-nasun-c5 hover:brightness-110 disabled:bg-nasun-c6 disabled:text-nasun-white/50 px-6 py-3 rounded-xl font-medium transition-all active:scale-[0.97]"
      >
        {isSearching ? 'Searching...' : 'Search'}
      </button>
    </form>
  );
}
