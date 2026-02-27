import { memo } from 'react';
import { Card } from '../ui/Card';
import { formatLastUpdated, formatDuration, formatBalance } from '../../lib/format';
import type { NetworkStatus, EpochInfo } from '../../lib/types';

interface NetworkStatusCardsProps {
  status: NetworkStatus | undefined;
  epochInfo: EpochInfo | undefined;
  tps: number | null | undefined;
  isLoading: boolean;
  isFetching: boolean;
  updatedAt: number | undefined;
}

export default memo(function NetworkStatusCards({
  status,
  epochInfo,
  tps,
  isLoading,
  isFetching,
  updatedAt,
}: NetworkStatusCardsProps) {
  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold text-foreground">Network Status</h2>
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
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card variant="default" className="p-4">
            <div className="text-muted-foreground text-sm uppercase tracking-wider">Status</div>
            <div
              className={`text-lg font-semibold ${
                status?.isConnected ? 'text-green-500' : 'text-red-500'
              }`}
            >
              {status?.isConnected ? 'Connected' : 'Disconnected'}
            </div>
          </Card>
          <Card variant="default" className="p-4">
            <div className="text-muted-foreground text-sm uppercase tracking-wider">Chain ID</div>
            <div className="text-lg font-mono text-foreground">{status?.chainId || '-'}</div>
          </Card>
          <Card variant="default" className="p-4">
            <div className="text-muted-foreground text-sm uppercase tracking-wider">Epoch</div>
            <div className="flex items-baseline justify-between">
              <span className="text-lg font-mono text-foreground">{epochInfo?.epoch || '-'}</span>
              <span className="text-xs text-muted-foreground">
                {epochInfo?.remainingMs ? `${formatDuration(epochInfo.remainingMs)} left` : ''}
              </span>
            </div>
          </Card>
          <Card variant="default" className="p-4">
            <div className="text-muted-foreground text-sm uppercase tracking-wider">Checkpoint</div>
            <div className="text-lg font-mono text-foreground">{status?.latestCheckpoint || '-'}</div>
          </Card>
          <Card variant="default" className="p-4">
            <div className="text-muted-foreground text-sm uppercase tracking-wider">TPS</div>
            <div className="text-lg font-mono text-foreground">
              {tps !== null && tps !== undefined ? `${tps} tx/s` : '-'}
            </div>
          </Card>
          <Card variant="default" className="p-4">
            <div className="text-muted-foreground text-sm uppercase tracking-wider">Gas Price</div>
            <div className="text-lg font-mono text-foreground">
              {status?.referenceGasPrice || '-'} SOE
            </div>
          </Card>
          <Card variant="default" className="p-4">
            <div className="text-muted-foreground text-sm uppercase tracking-wider">Total Stake</div>
            <div className="text-lg font-mono text-foreground truncate">
              {epochInfo?.totalStake ? `${formatBalance(epochInfo.totalStake)} NSN` : '-'}
            </div>
          </Card>
          <Card variant="default" className="p-4">
            <div className="text-muted-foreground text-sm uppercase tracking-wider">Validators</div>
            <div className="text-lg font-mono text-foreground">
              {epochInfo?.activeValidatorsCount ?? '-'}
            </div>
          </Card>
        </div>
      )}
    </section>
  );
});
