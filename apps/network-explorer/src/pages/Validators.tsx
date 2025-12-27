import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getValidators } from '../lib/sui-client';
import { formatBalance } from '../lib/format';
import { Card } from '../components/ui/Card';

function truncateAddress(address: string) {
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

function formatPercentage(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

export default function Validators() {
  const { data, isLoading, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ['validators'],
    queryFn: getValidators,
    refetchInterval: 30000, // 30초마다 갱신
    staleTime: 25000,
  });

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
          <h1 className="text-2xl font-bold">Validators</h1>
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

        {/* Network Staking Summary */}
        {data && (
          <section className="mb-8">
            <h2 className="text-lg font-semibold mb-4">Network Staking Summary</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card variant="c4" className="p-4">
                <div className="text-nasun-white/60 text-sm uppercase tracking-wider">Current Epoch</div>
                <div className="text-lg font-mono text-nasun-white">{data.epoch}</div>
              </Card>
              <Card variant="c4" className="p-4">
                <div className="text-nasun-white/60 text-sm uppercase tracking-wider">Total Staked</div>
                <div className="text-lg font-mono text-nasun-white">{formatBalance(data.totalStake)} NASUN</div>
              </Card>
              <Card variant="c4" className="p-4">
                <div className="text-nasun-white/60 text-sm uppercase tracking-wider">Active Validators</div>
                <div className="text-lg font-mono text-nasun-white">{data.activeValidators.length}</div>
              </Card>
              <Card variant="c4" className="p-4">
                <div className="text-nasun-white/60 text-sm uppercase tracking-wider">Avg APY</div>
                <div className="text-lg font-mono text-nasun-white">
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
          <div className="text-nasun-white/60">Loading...</div>
        ) : data?.activeValidators && data.activeValidators.length > 0 ? (
          <div className="rounded-xl overflow-hidden border border-nasun-c4/50 bg-nasun-c6/80 backdrop-blur-md">
            <table className="w-full">
              <thead className="bg-nasun-c6/80 border-b border-nasun-c4/30">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-nasun-white/80">Validator</th>
                  <th className="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-nasun-white/80">Address</th>
                  <th className="px-4 py-3 text-right text-sm font-medium uppercase tracking-wider text-nasun-white/80">Stake</th>
                  <th className="px-4 py-3 text-right text-sm font-medium uppercase tracking-wider text-nasun-white/80">APY</th>
                  <th className="px-4 py-3 text-right text-sm font-medium uppercase tracking-wider text-nasun-white/80">Commission</th>
                  <th className="px-4 py-3 text-right text-sm font-medium uppercase tracking-wider text-nasun-white/80">Voting Power</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-nasun-c4/20">
                {data.activeValidators.map((validator) => (
                  <tr key={validator.address} className="hover:bg-nasun-c4/10 transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        to={`/validator/${validator.address}`}
                        className="flex items-center gap-2 text-nasun-c4 hover:underline"
                      >
                        {validator.imageUrl && (
                          <img
                            src={validator.imageUrl}
                            alt={validator.name}
                            className="w-6 h-6 rounded-full"
                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                          />
                        )}
                        <span className="font-medium">{validator.name || 'Unnamed'}</span>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        to={`/validator/${validator.address}`}
                        className="font-mono text-sm text-nasun-white/60 hover:text-nasun-white hover:underline"
                      >
                        {truncateAddress(validator.address)}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-nasun-white/80">
                      {formatBalance(validator.stakingPoolSuiBalance)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-nasun-c3 font-medium">
                        {formatPercentage(validator.apy)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-nasun-white/60">
                      {validator.commissionRate}%
                    </td>
                    <td className="px-4 py-3 text-right text-nasun-white/60">
                      {validator.votingPower}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Card variant="c6" className="p-8 text-center text-nasun-white/60">
            No validators found
          </Card>
        )}
    </>
  );
}
