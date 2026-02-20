import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { getNetworkState, type NetworkState } from '../../lib/sui-client';
import { formatBalance } from '../../lib/format';
import { formatCompactNumber } from '../../lib/analytics/analytics-aggregator';

export function NetworkStateSection() {
  const { data, isLoading } = useQuery<NetworkState | null>({
    queryKey: ['network-state'],
    queryFn: getNetworkState,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Card key={i} variant="default" className="p-4 animate-pulse">
            <div className="h-3 w-20 bg-muted/40 rounded mb-3" />
            <div className="h-7 w-24 bg-muted/40 rounded" />
          </Card>
        ))}
      </div>
    );
  }

  if (!data) {
    return (
      <Card variant="default" className="p-8 text-center">
        <p className="text-muted-foreground">Unable to fetch network state.</p>
      </Card>
    );
  }

  const epochDurationHours = Math.round(Number(data.epochDurationMs) / 3_600_000 * 10) / 10;
  const subsidyBalance = formatBalance(data.stakeSubsidyBalance);
  const subsidyRate = formatBalance(data.stakeSubsidyCurrentDistributionAmount);
  const storageFund = formatBalance(data.storageFundTotalObjectStorageRebates);
  const storageNonRefundable = formatBalance(data.storageFundNonRefundableBalance);

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      <Card variant="default" className="p-4">
        <div className="text-muted-foreground text-xs uppercase tracking-wider mb-2">
          Current Epoch
        </div>
        <div className="text-2xl font-bold text-foreground">
          <Link to={`/epoch/${data.epoch}`} className="hover:text-primary transition-colors">
            #{data.epoch}
          </Link>
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          Duration: {epochDurationHours}h
        </div>
      </Card>

      <Card variant="default" className="p-4">
        <div className="text-muted-foreground text-xs uppercase tracking-wider mb-2">
          Total Stake
        </div>
        <div className="text-2xl font-bold text-foreground truncate" title={`${formatBalance(data.totalStake)} NSN`}>
          {formatCompactNumber(Number(data.totalStake) / 1e9)}
        </div>
        <div className="text-xs text-muted-foreground mt-1">NSN</div>
      </Card>

      <Card variant="default" className="p-4">
        <div className="text-muted-foreground text-xs uppercase tracking-wider mb-2">
          Reference Gas Price
        </div>
        <div className="text-2xl font-bold text-foreground">
          {BigInt(data.referenceGasPrice).toLocaleString('en-US')}
        </div>
        <div className="text-xs text-muted-foreground mt-1">SOE</div>
      </Card>

      <Card variant="default" className="p-4">
        <div className="text-muted-foreground text-xs uppercase tracking-wider mb-2">
          Active Validators
        </div>
        <div className="text-2xl font-bold text-foreground">
          <Link to="/validators" className="hover:text-primary transition-colors">
            {data.activeValidatorsCount}
          </Link>
        </div>
      </Card>

      <Card variant="default" className="p-4">
        <div className="text-muted-foreground text-xs uppercase tracking-wider mb-2">
          Stake Subsidy Balance
        </div>
        <div className="text-xl font-bold text-foreground truncate" title={`${subsidyBalance} NSN`}>
          {formatCompactNumber(Number(data.stakeSubsidyBalance) / 1e9)}
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          NSN remaining
        </div>
      </Card>

      <Card variant="default" className="p-4">
        <div className="text-muted-foreground text-xs uppercase tracking-wider mb-2">
          Subsidy Distribution
        </div>
        <div className="text-xl font-bold text-foreground truncate" title={`${subsidyRate} NSN/epoch`}>
          {formatCompactNumber(Number(data.stakeSubsidyCurrentDistributionAmount) / 1e9)}
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          NSN / epoch (since epoch {data.stakeSubsidyStartEpoch})
        </div>
      </Card>

      <Card variant="default" className="p-4">
        <div className="text-muted-foreground text-xs uppercase tracking-wider mb-2">
          Storage Fund
        </div>
        <div className="text-xl font-bold text-foreground truncate" title={`${storageFund} NSN`}>
          {formatCompactNumber(Number(data.storageFundTotalObjectStorageRebates) / 1e9)}
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          NSN ({storageNonRefundable} non-refundable)
        </div>
      </Card>

      <Card variant="default" className="p-4">
        <div className="text-muted-foreground text-xs uppercase tracking-wider mb-2">
          Safe Mode
        </div>
        <div className="mt-1">
          {data.safeMode ? (
            <Badge variant="error">ACTIVE</Badge>
          ) : (
            <Badge variant="success">OFF</Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground mt-2">
          {data.safeMode ? 'Network is in recovery mode' : 'Network operating normally'}
        </div>
      </Card>
    </div>
  );
}
