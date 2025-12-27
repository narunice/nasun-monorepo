import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getValidatorByAddress } from '../lib/sui-client';
import { formatBalance, formatSoe } from '../lib/format';
import { Card } from '../components/ui/Card';
import { SectionBox } from '../components/ui/SectionBox';

function formatPercentage(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

export default function Validator() {
  const { address } = useParams<{ address: string }>();

  const { data: validator, isLoading } = useQuery({
    queryKey: ['validator', address],
    queryFn: () => getValidatorByAddress(address!),
    enabled: !!address,
  });

  if (isLoading) {
    return <div className="text-nasun-white/60">Loading...</div>;
  }

  if (!validator) {
    return (
      <>
        <div className="mb-6">
          <Link to="/validators" className="text-nasun-c4 hover:underline">
            &larr; Back to Validators
          </Link>
        </div>
        <Card variant="c3" className="p-6">
          <h2 className="text-lg font-semibold text-red-400">Validator Not Found</h2>
          <p className="text-nasun-white/60 mt-2">
            No validator found with address: {address}
          </p>
        </Card>
      </>
    );
  }

  return (
    <>
      <div className="mb-6">
        <Link to="/validators" className="text-nasun-c4 hover:underline">
          &larr; Back to Validators
        </Link>
      </div>

        {/* Validator Header */}
        <div className="flex items-center gap-4 mb-8">
          {validator.imageUrl && (
            <img
              src={validator.imageUrl}
              alt={validator.name}
              className="w-16 h-16 rounded-full"
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
          )}
          <div>
            <h1 className="text-2xl font-bold">{validator.name || 'Unnamed Validator'}</h1>
            <p className="text-nasun-white/60 font-mono text-sm break-all">{validator.address}</p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card variant="c4" className="p-4">
            <div className="text-nasun-white/60 text-sm uppercase tracking-wider">Staked Amount</div>
            <div className="text-lg font-mono text-nasun-white">{formatBalance(validator.stakingPoolSuiBalance)} NASUN</div>
          </Card>
          <Card variant="c3" className="p-4">
            <div className="text-nasun-white/60 text-sm uppercase tracking-wider">APY</div>
            <div className="text-lg font-mono text-nasun-c3">{formatPercentage(validator.apy)}</div>
          </Card>
          <Card variant="c4" className="p-4">
            <div className="text-nasun-white/60 text-sm uppercase tracking-wider">Commission Rate</div>
            <div className="text-lg font-mono text-nasun-white">{validator.commissionRate}%</div>
          </Card>
          <Card variant="c4" className="p-4">
            <div className="text-nasun-white/60 text-sm uppercase tracking-wider">Voting Power</div>
            <div className="text-lg font-mono text-nasun-white">{validator.votingPower}</div>
          </Card>
        </div>

        {/* Validator Details */}
        <SectionBox title="Validator Details" color="c5">
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
              <span className="text-nasun-white/60 text-sm min-w-[140px]">Address</span>
              <span className="font-mono text-sm break-all">{validator.address}</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
              <span className="text-nasun-white/60 text-sm min-w-[140px]">Name</span>
              <span>{validator.name || '-'}</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
              <span className="text-nasun-white/60 text-sm min-w-[140px]">Description</span>
              <span className="text-sm">{validator.description || '-'}</span>
            </div>
            {validator.projectUrl && (
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
                <span className="text-nasun-white/60 text-sm min-w-[140px]">Project URL</span>
                <a
                  href={validator.projectUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-nasun-c4 hover:underline text-sm"
                >
                  {validator.projectUrl}
                </a>
              </div>
            )}
          </div>
        </SectionBox>

        {/* Staking Info */}
        <SectionBox title="Staking Information" color="c4" className="mt-6">
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
              <span className="text-nasun-white/60 text-sm min-w-[180px]">Current Stake</span>
              <span className="font-mono">{formatBalance(validator.stakingPoolSuiBalance)} NASUN</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
              <span className="text-nasun-white/60 text-sm min-w-[180px]">Next Epoch Stake</span>
              <span className="font-mono">{formatBalance(validator.nextEpochStake)} NASUN</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
              <span className="text-nasun-white/60 text-sm min-w-[180px]">Gas Price</span>
              <span className="font-mono">{formatSoe(validator.gasPrice)}</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
              <span className="text-nasun-white/60 text-sm min-w-[180px]">Current Epoch</span>
              <span className="font-mono">{validator.epoch}</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
              <span className="text-nasun-white/60 text-sm min-w-[180px]">Total Network Stake</span>
              <span className="font-mono">{formatBalance(validator.totalNetworkStake)} NASUN</span>
            </div>
          </div>
        </SectionBox>
    </>
  );
}
