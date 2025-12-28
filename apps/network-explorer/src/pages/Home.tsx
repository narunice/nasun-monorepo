import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getNetworkStatus, getRecentTransactions, getObject, getEpochInfo, getTPS } from '../lib/sui-client';
import { Link } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';

// TPS history data point
interface TPSDataPoint {
  time: string;
  tps: number;
}

// Max history points to keep
const MAX_TPS_HISTORY = 30;

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
  const [tpsHistory, setTpsHistory] = useState<TPSDataPoint[]>([]);
  const lastTpsRef = useRef<number | null>(null);

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

  // Update TPS history when new data arrives
  useEffect(() => {
    if (tps !== null && tps !== undefined && tps !== lastTpsRef.current) {
      lastTpsRef.current = tps;
      const now = new Date();
      const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

      setTpsHistory(prev => {
        const newHistory = [...prev, { time: timeStr, tps }];
        // Keep only last MAX_TPS_HISTORY points
        if (newHistory.length > MAX_TPS_HISTORY) {
          return newHistory.slice(-MAX_TPS_HISTORY);
        }
        return newHistory;
      });
    }
  }, [tps]);

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

      {/* Network Charts */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Network Activity</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* TPS Trend Chart */}
          <Card variant="c6" className="p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="text-nasun-white/60 text-sm uppercase tracking-wider">TPS Trend</div>
              <div className="text-xs text-nasun-white/40">(Last {tpsHistory.length} updates)</div>
            </div>
            {tpsHistory.length >= 2 ? (
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={tpsHistory} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="tpsGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="time"
                      tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }}
                      axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                      tickLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }}
                      axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                      tickLine={false}
                      width={40}
                      domain={[0, 'auto']}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'rgba(30, 41, 59, 0.95)',
                        border: '1px solid rgba(59, 130, 246, 0.3)',
                        borderRadius: '8px',
                        color: '#fff',
                      }}
                      labelStyle={{ color: 'rgba(255,255,255,0.6)' }}
                      formatter={(value) => [`${value} tx/s`, 'TPS']}
                    />
                    <Area
                      type="monotone"
                      dataKey="tps"
                      stroke="#3B82F6"
                      strokeWidth={2}
                      fill="url(#tpsGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-nasun-white/40 text-sm">
                Collecting data... ({tpsHistory.length}/2 points)
              </div>
            )}
          </Card>

          {/* Epoch Progress */}
          <Card variant="c6" className="p-4">
            <div className="text-nasun-white/60 text-sm uppercase tracking-wider mb-4">Epoch Progress</div>
            {epochInfo ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-nasun-white text-lg font-mono">Epoch {epochInfo.epoch}</span>
                  <span className="text-nasun-white/60 text-sm">
                    {formatDuration(epochInfo.remainingMs)} remaining
                  </span>
                </div>
                <div className="relative">
                  <div className="h-4 bg-nasun-c4/20 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-nasun-c4 to-nasun-c5 transition-all duration-500"
                      style={{ width: `${epochInfo.progress}%` }}
                    />
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-xs text-white font-medium drop-shadow">
                      {epochInfo.progress.toFixed(1)}%
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-nasun-white/40">Started</div>
                    <div className="text-nasun-white font-mono">
                      {new Date(epochInfo.startTimestamp).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>
                  <div>
                    <div className="text-nasun-white/40">Est. End</div>
                    <div className="text-nasun-white font-mono">
                      {new Date(epochInfo.endTimestamp).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-nasun-white/40 text-sm">
                Loading epoch info...
              </div>
            )}
          </Card>
        </div>
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
