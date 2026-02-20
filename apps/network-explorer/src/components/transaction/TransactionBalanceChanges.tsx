import { Link } from 'react-router-dom';
import { SectionBox } from '../ui/SectionBox';
import { formatTokenBalance, truncateAddress } from '../../lib/format';
import type { BalanceChange } from '@mysten/sui/client';

interface TransactionBalanceChangesProps {
  balanceChanges: readonly BalanceChange[] | null | undefined;
}

function getCoinSymbol(coinType: string): string {
  if (coinType === '0x2::sui::SUI') return 'NSN';
  const parts = coinType.split('::');
  return parts[parts.length - 1] ?? coinType;
}

function getOwnerAddress(owner: BalanceChange['owner']): string | null {
  if (typeof owner === 'object' && owner !== null) {
    if ('AddressOwner' in owner) return owner.AddressOwner;
    if ('ObjectOwner' in owner) return owner.ObjectOwner;
  }
  return null;
}

export default function TransactionBalanceChanges({
  balanceChanges,
}: TransactionBalanceChangesProps) {
  if (!balanceChanges || balanceChanges.length === 0) return null;

  return (
    <SectionBox title={`Balance Changes (${balanceChanges.length})`} color="c3">
      <div className="space-y-0.5">
        {balanceChanges.map((change, idx) => {
          const address = getOwnerAddress(change.owner);
          const symbol = getCoinSymbol(change.coinType);
          const isPositive = !change.amount.startsWith('-');
          const absAmount = isPositive ? change.amount : change.amount.slice(1);

          return (
            <div
              key={idx}
              className="flex items-center justify-between py-2 border-b border-border/20 last:border-0"
            >
              <div className="flex-1 min-w-0 mr-4">
                {address ? (
                  <Link
                    to={`/address/${address}`}
                    className="font-mono text-sm text-foreground hover:text-primary hover:underline"
                  >
                    {truncateAddress(address)}
                  </Link>
                ) : (
                  <span className="font-mono text-sm text-muted-foreground">
                    {String(change.owner)}
                  </span>
                )}
              </div>
              <span
                className={`font-mono text-sm font-medium whitespace-nowrap ${
                  isPositive ? 'text-green-400' : 'text-destructive'
                }`}
              >
                {isPositive ? '+' : '-'}
                {formatTokenBalance(absAmount, change.coinType)} {symbol}
              </span>
            </div>
          );
        })}
      </div>
    </SectionBox>
  );
}
