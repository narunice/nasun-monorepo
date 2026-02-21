import { useState } from 'react';
import { Badge } from '../ui/Badge';
import { formatBalance } from '../../lib/format';
import type { StakeInfo } from '@nasun/wallet';

interface StakePositionRowProps {
  stake: StakeInfo;
  onUnstake: (stakedSuiId: string) => void;
  isUnstaking: boolean;
}

export default function StakePositionRow({ stake, onUnstake, isUnstaking }: StakePositionRowProps) {
  const [confirming, setConfirming] = useState(false);
  const isActive = stake.status === 'Active';
  const isPending = stake.status === 'Pending';

  const principalFormatted = formatBalance(stake.principal.toString());
  const rewardFormatted = stake.estimatedReward
    ? formatBalance(stake.estimatedReward.toString())
    : null;

  return (
    <div className="bg-muted/30 border border-border rounded-lg p-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        {/* Stake info */}
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-mono text-foreground">{principalFormatted} NSN</span>
            <Badge variant={isActive ? 'success' : 'info'}>
              {stake.status}
            </Badge>
          </div>
          {isActive && rewardFormatted && (
            <div className="text-xs text-muted-foreground">
              Reward: <span className="text-green-400 font-mono">{rewardFormatted} NSN</span>
            </div>
          )}
        </div>

        {/* Unstake action */}
        <div className="flex items-center gap-2">
          {isPending ? (
            <span className="text-xs text-muted-foreground">Pending activation</span>
          ) : confirming ? (
            <div className="flex items-center gap-2 bg-destructive/10 rounded-sm px-2 py-1">
              <span className="text-xs text-foreground">
                Unstake {principalFormatted} NSN?
              </span>
              <button
                onClick={() => {
                  onUnstake(stake.stakedSuiId);
                  setConfirming(false);
                }}
                disabled={isUnstaking}
                className="text-xs font-medium text-destructive hover:text-destructive/80 transition-colors disabled:opacity-50"
              >
                {isUnstaking ? 'Unstaking...' : 'Confirm'}
              </button>
              <button
                onClick={() => setConfirming(false)}
                disabled={isUnstaking}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirming(true)}
              disabled={isUnstaking}
              className="px-3 py-1 text-xs font-medium rounded-sm border border-destructive/20 text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
            >
              Unstake
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
