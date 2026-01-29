/**
 * TierBadge - Compliance Eligibility Signal badge for executors
 */

import type { TierLevel, TierName } from '@/config/network';

const TIER_STYLES: Record<TierLevel, string> = {
  0: 'bg-gray-500/20 text-gray-400',
  1: 'bg-amber-700/20 text-amber-500',
  2: 'bg-slate-300/20 text-slate-300',
  3: 'bg-yellow-400/20 text-yellow-400',
};

interface TierBadgeProps {
  tier: TierLevel;
  tierName: TierName;
}

export function TierBadge({ tier, tierName }: TierBadgeProps) {
  return (
    <span
      className={`px-1.5 py-0.5 text-xs font-medium rounded ${TIER_STYLES[tier]}`}
      title="Tier reflects staking commitment and track record, not a guarantee of output quality."
    >
      {tierName}
    </span>
  );
}

export function DormantBadge() {
  return (
    <span
      className="px-1.5 py-0.5 text-xs font-medium rounded bg-gray-600/20 text-gray-500"
      title="Inactive for more than 7 days"
    >
      Dormant
    </span>
  );
}
