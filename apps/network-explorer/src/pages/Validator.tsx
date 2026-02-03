import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getValidatorByAddress } from '../lib/sui-client';
import { formatBalance, formatSoe, formatPercentage } from '../lib/format';
import { resolveMediaUrl, sanitizeHref } from '../lib/media';
import { Card } from '../components/ui/Card';
import { SectionBox } from '../components/ui/SectionBox';

export default function Validator() {
  const { address } = useParams<{ address: string }>();

  const { data: validator, isLoading } = useQuery({
    queryKey: ['validator', address],
    queryFn: () => getValidatorByAddress(address!),
    enabled: !!address,
  });

  if (isLoading) {
    return <div className="text-muted-foreground">Loading...</div>;
  }

  if (!validator) {
    return (
      <>
        <div className="mb-6">
          <Link to="/validators" className="text-primary hover:underline">
            &larr; Back to Validators
          </Link>
        </div>
        <Card variant="default" className="p-6 border-destructive/50">
          <h2 className="text-lg font-semibold text-destructive">Validator Not Found</h2>
          <p className="text-muted-foreground mt-2">
            No validator found with address: {address}
          </p>
        </Card>
      </>
    );
  }

  return (
    <>
      <div className="mb-6">
        <Link to="/validators" className="text-primary hover:underline">
          &larr; Back to Validators
        </Link>
      </div>

      {/* Validator Header */}
      <div className="flex items-center gap-4 mb-8">
        {resolveMediaUrl(validator.imageUrl) && (
          <img
            src={resolveMediaUrl(validator.imageUrl)!}
            alt={validator.name}
            className="w-16 h-16 rounded-full"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        )}
        <div>
          <h1 className="text-2xl font-bold text-foreground">{validator.name || 'Unnamed Validator'}</h1>
          <p className="text-muted-foreground font-mono text-sm break-all">{validator.address}</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Card variant="default" className="p-4">
          <div className="text-muted-foreground text-sm uppercase tracking-wider">Staked Amount</div>
          <div className="text-lg font-mono text-foreground">{formatBalance(validator.stakingPoolSuiBalance)} NSN</div>
        </Card>
        <Card variant="default" className="p-4">
          <div className="text-muted-foreground text-sm uppercase tracking-wider">APY</div>
          <div className="text-lg font-mono text-green-600 dark:text-green-400">{formatPercentage(validator.apy)}</div>
        </Card>
        <Card variant="default" className="p-4">
          <div className="text-muted-foreground text-sm uppercase tracking-wider">Commission Rate</div>
          <div className="text-lg font-mono text-foreground">{validator.commissionRate}%</div>
        </Card>
        <Card variant="default" className="p-4">
          <div className="text-muted-foreground text-sm uppercase tracking-wider">Voting Power</div>
          <div className="text-lg font-mono text-foreground">{validator.votingPower}</div>
        </Card>
      </div>

      {/* Validator Details */}
      <SectionBox title="Validator Details" color="c5">
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
            <span className="text-muted-foreground text-sm min-w-[140px]">Address</span>
            <span className="font-mono text-sm break-all text-foreground">{validator.address}</span>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
            <span className="text-muted-foreground text-sm min-w-[140px]">Name</span>
            <span className="text-foreground">{validator.name || '-'}</span>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
            <span className="text-muted-foreground text-sm min-w-[140px]">Description</span>
            <span className="text-sm text-foreground">{validator.description || '-'}</span>
          </div>
          {sanitizeHref(validator.projectUrl) && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
              <span className="text-muted-foreground text-sm min-w-[140px]">Project URL</span>
              <a
                href={sanitizeHref(validator.projectUrl)!}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline text-sm"
              >
                {validator.projectUrl}
              </a>
            </div>
          )}
        </div>
      </SectionBox>

      {/* Staking Info */}
      <SectionBox title="Staking Information" color="c4" className="mt-6">
        <div className="space-y-3 text-foreground">
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
            <span className="text-muted-foreground text-sm min-w-[180px]">Current Stake</span>
            <span className="font-mono">{formatBalance(validator.stakingPoolSuiBalance)} NSN</span>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
            <span className="text-muted-foreground text-sm min-w-[180px]">Next Epoch Stake</span>
            <span className="font-mono">{formatBalance(validator.nextEpochStake)} NSN</span>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
            <span className="text-muted-foreground text-sm min-w-[180px]">Gas Price</span>
            <span className="font-mono">{formatSoe(validator.gasPrice)}</span>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
            <span className="text-muted-foreground text-sm min-w-[180px]">Current Epoch</span>
            <span className="font-mono">{validator.epoch}</span>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
            <span className="text-muted-foreground text-sm min-w-[180px]">Total Network Stake</span>
            <span className="font-mono">{formatBalance(validator.totalNetworkStake)} NSN</span>
          </div>
        </div>
      </SectionBox>
    </>
  );
}
