import { Link } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { TPSChart, EpochProgress, SearchBar } from '../components/charts';
import { useNetworkStatus, useEpochInfo, useTPS, useRecentTransactions, useTPSHistory } from '../hooks';
import { formatTimestamp, truncateDigest, formatLastUpdated, formatDuration } from '../lib/format';

export default function Home() {
  // Network data queries
  const {
    data: networkStatus,
    isLoading: statusLoading,
    dataUpdatedAt: statusUpdatedAt,
    isFetching: statusFetching,
  } = useNetworkStatus();
  const { data: epochInfo, isFetching: epochFetching } = useEpochInfo();
  const { data: tps, isFetching: tpsFetching } = useTPS();
  const {
    data: recentTxs,
    isLoading: txLoading,
    dataUpdatedAt: txUpdatedAt,
    isFetching: txFetching,
  } = useRecentTransactions(10);

  // TPS history for chart
  const tpsHistory = useTPSHistory(tps ?? null);

  const isAnyFetching = statusFetching || epochFetching || tpsFetching;

  return (
    <>
      {/* Search Bar - positioned at top for easy discovery */}
      <section className="mb-8">
        <SearchBar />
      </section>

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
              <div
                className={`text-lg font-semibold ${networkStatus?.isConnected ? 'text-green-400' : 'text-red-400'}`}
              >
                {networkStatus?.isConnected ? 'Connected' : 'Disconnected'}
              </div>
            </Card>
            <Card variant="c4" className="p-4">
              <div className="text-nasun-white/60 text-sm uppercase tracking-wider">Chain ID</div>
              <div className="text-lg font-mono text-nasun-white">
                {networkStatus?.chainId || '-'}
              </div>
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
              <div className="text-lg font-mono text-nasun-white">
                {networkStatus?.latestCheckpoint || '-'}
              </div>
            </Card>
            <Card variant="c4" className="p-4">
              <div className="text-nasun-white/60 text-sm uppercase tracking-wider">TPS</div>
              <div className="text-lg font-mono text-nasun-white">
                {tps !== null && tps !== undefined ? `${tps} tx/s` : '-'}
              </div>
            </Card>
            <Card variant="c4" className="p-4">
              <div className="text-nasun-white/60 text-sm uppercase tracking-wider">Gas Price</div>
              <div className="text-lg font-mono text-nasun-white">
                {networkStatus?.referenceGasPrice || '-'} SOE
              </div>
            </Card>
          </div>
        )}
      </section>

      {/* Network Charts */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Network Activity</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <TPSChart data={tpsHistory} />
          <EpochProgress epochInfo={epochInfo} />
        </div>
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
                  <th className="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-nasun-white/80">
                    Digest
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-nasun-white/80">
                    Time
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-nasun-white/80">
                    Checkpoint
                  </th>
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
                    <td className="px-4 py-3 text-nasun-white/60 font-mono">{tx.checkpoint || '-'}</td>
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
