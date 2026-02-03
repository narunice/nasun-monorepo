import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getValidators } from '../lib/sui-client';
import { formatBalance, formatPercentage, truncateAddress, formatLastUpdated } from '../lib/format';
import { resolveMediaUrl } from '../lib/media';
import { Card } from '../components/ui/Card';
import { useMinDuration } from '../hooks';

export default function Validators() {
  const { data, isLoading, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ['validators'],
    queryFn: getValidators,
    refetchInterval: 30000,
    staleTime: 25000,
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
          <h1 className="text-2xl font-bold text-foreground">Validators</h1>
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

      {/* Network Staking Summary */}
      {data && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-4 text-foreground">Network Staking Summary</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card variant="default" className="p-4">
              <div className="text-muted-foreground text-sm uppercase tracking-wider">Current Epoch</div>
              <div className="text-lg font-mono text-foreground">{data.epoch}</div>
            </Card>
            <Card variant="default" className="p-4">
              <div className="text-muted-foreground text-sm uppercase tracking-wider">Total Staked</div>
              <div className="text-lg font-mono text-foreground">{formatBalance(data.totalStake)} NSN</div>
            </Card>
            <Card variant="default" className="p-4">
              <div className="text-muted-foreground text-sm uppercase tracking-wider">Active Validators</div>
              <div className="text-lg font-mono text-foreground">{data.activeValidators.length}</div>
            </Card>
            <Card variant="default" className="p-4">
              <div className="text-muted-foreground text-sm uppercase tracking-wider">Avg APY</div>
              <div className="text-lg font-mono text-foreground">
                {data.activeValidators.length > 0
                  ? formatPercentage(
                      data.activeValidators.reduce((sum, v) => sum + v.apy, 0) / data.activeValidators.length
                    )
                  : '-'}
              </div>
            </Card>
          </div>
        </section>
      )}

      {/* Validators Table */}
      {isLoading ? (
        <div className="text-muted-foreground">Loading...</div>
      ) : data?.activeValidators && data.activeValidators.length > 0 ? (
        <div className="rounded-xl overflow-hidden border border-border/20 bg-card/60 backdrop-blur-md">
          <table className="w-full">
            <thead className="bg-muted/50 border-b border-border/20">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-muted-foreground">Validator</th>
                <th className="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-muted-foreground">Address</th>
                <th className="px-4 py-3 text-right text-sm font-medium uppercase tracking-wider text-muted-foreground">Stake</th>
                <th className="px-4 py-3 text-right text-sm font-medium uppercase tracking-wider text-muted-foreground">APY</th>
                <th className="px-4 py-3 text-right text-sm font-medium uppercase tracking-wider text-muted-foreground">Commission</th>
                <th className="px-4 py-3 text-right text-sm font-medium uppercase tracking-wider text-muted-foreground">Voting Power</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {data.activeValidators.map((validator) => (
                <tr key={validator.address} className="hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-3">
                    <Link
                      to={`/validator/${validator.address}`}
                      className="flex items-center gap-2 text-primary hover:underline"
                    >
                      {resolveMediaUrl(validator.imageUrl) && (
                        <img
                          src={resolveMediaUrl(validator.imageUrl)!}
                          alt={validator.name}
                          className="w-6 h-6 rounded-full"
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                      )}
                      <span className="font-medium text-foreground">{validator.name || 'Unnamed'}</span>
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      to={`/validator/${validator.address}`}
                      className="font-mono text-sm text-muted-foreground hover:text-foreground hover:underline"
                    >
                      {truncateAddress(validator.address)}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                    {formatBalance(validator.stakingPoolSuiBalance)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-green-600 dark:text-green-400 font-medium">
                      {formatPercentage(validator.apy)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    {validator.commissionRate}%
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    {validator.votingPower}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Card variant="default" className="p-8 text-center text-muted-foreground">
          No validators found
        </Card>
      )}
    </>
  );
}
