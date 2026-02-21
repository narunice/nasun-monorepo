import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { SectionBox } from '../ui/SectionBox';
import { Card } from '../ui/Card';
import { useSigner, useBalance, useStaking, useStakeTransaction } from '@nasun/wallet';
import { formatBalance } from '../../lib/format';
import StakePositionRow from './StakePositionRow';

interface ValidatorStakingProps {
  validatorAddress: string;
}

// Gas reserve: keep 0.01 NSN for gas fees
const GAS_RESERVE_MIST = BigInt(10_000_000); // 0.01 NSN
const MIST_PER_NSN = BigInt(1_000_000_000);

// Parse NSN string to MIST BigInt (avoids floating-point precision loss)
function parseNsnToMist(input: string): bigint {
  const [whole = '0', frac = ''] = input.split('.');
  if (!/^\d+$/.test(whole)) return 0n;
  const integer = BigInt(whole) * MIST_PER_NSN;
  if (!frac) return integer;
  const fracPadded = frac.padEnd(9, '0').slice(0, 9);
  return integer + BigInt(fracPadded);
}

export default function ValidatorStaking({ validatorAddress }: ValidatorStakingProps) {
  const { isConnected } = useSigner();
  const { data: balanceInfo } = useBalance();
  const { stakes } = useStaking();
  const { stake, unstake, isPending, error, lastResult, clearError, clearResult } = useStakeTransaction();

  const [amount, setAmount] = useState('');

  // Filter stakes for this specific validator
  const validatorStakes = useMemo(() => {
    return stakes
      .filter((ds) => ds.validatorAddress === validatorAddress)
      .flatMap((ds) => ds.stakes);
  }, [stakes, validatorAddress]);

  // Calculate available balance (raw MIST from balanceInfo)
  const availableBalanceMist = useMemo(() => {
    if (!balanceInfo?.totalBalance) return BigInt(0);
    return BigInt(balanceInfo.totalBalance);
  }, [balanceInfo]);

  // Max stakeable amount (balance minus gas reserve)
  const maxStakeMist = useMemo(() => {
    const max = availableBalanceMist - GAS_RESERVE_MIST;
    return max > BigInt(0) ? max : BigInt(0);
  }, [availableBalanceMist]);

  // Validate input (BigInt-safe conversion)
  const amountInMist = parseNsnToMist(amount);
  const isValidAmount = amountInMist >= MIST_PER_NSN; // min 1 NSN
  const isOverMax = amountInMist > maxStakeMist;
  const canStake = isValidAmount && !isOverMax && !isPending;

  const handleStake = async () => {
    if (!canStake) return;
    clearError();
    clearResult();
    try {
      await stake({ amount, validatorAddress });
      setAmount('');
    } catch {
      // Error is handled by hook state
    }
  };

  const handleUnstake = async (stakedSuiId: string) => {
    clearError();
    clearResult();
    try {
      await unstake({ stakedSuiId });
    } catch {
      // Error is handled by hook state
    }
  };

  const handleMax = () => {
    // Convert maxStakeMist to integer NSN (BigInt division, no float)
    const nsn = maxStakeMist / MIST_PER_NSN;
    setAmount(nsn > 0n ? nsn.toString() : '0');
  };

  // Not connected state
  if (!isConnected) {
    return (
      <SectionBox title="Stake NSN" color="c3" className="mt-6">
        <p className="text-muted-foreground text-sm">
          Connect your wallet to stake with this validator.
        </p>
      </SectionBox>
    );
  }

  return (
    <SectionBox title="Stake NSN" color="c3" className="mt-6">
      <div className="space-y-4">
        {/* Available balance */}
        <div className="text-sm text-muted-foreground">
          Available: <span className="font-mono text-foreground">{formatBalance(availableBalanceMist.toString())} NSN</span>
        </div>

        {/* Stake form */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex-1 relative">
            <label htmlFor="stake-amount" className="sr-only">Amount to stake</label>
            <input
              id="stake-amount"
              type="number"
              min="1"
              step="1"
              placeholder="Amount (min 1 NSN)"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                clearError();
                clearResult();
              }}
              disabled={isPending}
              className="w-full bg-muted/30 border border-border rounded-sm px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 disabled:opacity-50"
            />
            <button
              onClick={handleMax}
              aria-label="Set maximum stake amount"
              disabled={isPending}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-primary hover:text-primary/80 transition-colors disabled:opacity-50"
            >
              Max
            </button>
          </div>
          <button
            onClick={handleStake}
            disabled={!canStake}
            aria-busy={isPending}
            className="px-4 py-2 rounded-sm font-medium text-sm bg-primary/20 text-primary border border-primary/20 hover:bg-primary/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? 'Staking...' : 'Stake'}
          </button>
        </div>

        {/* Min stake hint */}
        {amount && !isValidAmount && (
          <p className="text-xs text-muted-foreground">Minimum: 1 NSN</p>
        )}
        {isOverMax && (
          <p className="text-xs text-destructive">Exceeds available balance (gas reserve: 0.01 NSN)</p>
        )}

        {/* TX result feedback */}
        {lastResult && lastResult.status === 'success' && lastResult.digest && (
          <Card variant="default" className="p-3 border-green-500/20 bg-green-500/5">
            <div className="text-sm text-green-400">
              {lastResult.operationType === 'stake' ? 'Staked' : 'Unstaked'} successfully.{' '}
              <Link to={`/tx/${lastResult.digest}`} className="underline hover:text-green-300">
                View transaction
              </Link>
            </div>
          </Card>
        )}
        {lastResult && lastResult.status === 'failure' && (
          <div role="alert">
            <Card variant="default" className="p-3 border-destructive/50">
              <div className="text-sm text-destructive">
                {lastResult.error || 'Transaction failed'}
              </div>
            </Card>
          </div>
        )}
        {error && !lastResult && (
          <div role="alert">
            <Card variant="default" className="p-3 border-destructive/50">
              <div className="text-sm text-destructive">{error}</div>
            </Card>
          </div>
        )}

        {/* Existing stakes for this validator */}
        {validatorStakes.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-foreground mb-2">Your Stakes</h4>
            <div className="space-y-2">
              {validatorStakes.map((s) => (
                <StakePositionRow
                  key={s.stakedSuiId}
                  stake={s}
                  onUnstake={handleUnstake}
                  isUnstaking={isPending}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </SectionBox>
  );
}
