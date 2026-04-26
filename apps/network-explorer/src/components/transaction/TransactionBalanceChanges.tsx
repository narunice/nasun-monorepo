import { Link } from 'react-router-dom';
import { SectionBox } from '../ui/SectionBox';
import { formatTokenBalance, truncateAddress } from '../../lib/format';
import type { BalanceChange } from '@mysten/sui/client';

interface TransactionBalanceChangesProps {
  balanceChanges: readonly BalanceChange[] | null | undefined;
  viewerAddress?: string | null;
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

function sameAddress(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.toLowerCase() === b.toLowerCase();
}

export default function TransactionBalanceChanges({
  balanceChanges,
  viewerAddress,
}: TransactionBalanceChangesProps) {
  if (!balanceChanges || balanceChanges.length === 0) return null;

  const viewerEntries = viewerAddress
    ? balanceChanges.filter((c) => sameAddress(getOwnerAddress(c.owner), viewerAddress))
    : [];

  return (
    <SectionBox title={`Balance Changes (${balanceChanges.length})`} color="c3">
      {viewerEntries.length > 0 && (
        <div className="mb-4 rounded-lg border border-nasun-c3/40 bg-nasun-c3/10 p-4">
          <div className="text-xs font-medium uppercase tracking-wider text-nasun-c3 mb-2">
            Your Balance Change
          </div>
          <div className="space-y-1">
            {viewerEntries.map((change, idx) => {
              const symbol = getCoinSymbol(change.coinType);
              const isPositive = !change.amount.startsWith('-');
              const absAmount = isPositive ? change.amount : change.amount.slice(1);
              return (
                <div key={idx} className="flex items-baseline justify-between">
                  <span className="text-xs text-muted-foreground font-mono truncate">
                    {change.coinType}
                  </span>
                  <span
                    className={`font-mono text-lg font-semibold whitespace-nowrap ${
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
        </div>
      )}

      <div className="space-y-0.5">
        {balanceChanges.map((change, idx) => {
          const address = getOwnerAddress(change.owner);
          const symbol = getCoinSymbol(change.coinType);
          const isPositive = !change.amount.startsWith('-');
          const absAmount = isPositive ? change.amount : change.amount.slice(1);
          const isViewer = sameAddress(address, viewerAddress);

          return (
            <div
              key={idx}
              className={`flex items-center justify-between py-2 border-b border-border/20 last:border-0 ${
                isViewer ? 'bg-nasun-c3/5 border-l-2 border-l-nasun-c3 pl-2 -ml-2' : ''
              }`}
            >
              <div className="flex-1 min-w-0 mr-4 flex items-center gap-2">
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
                {isViewer && (
                  <span className="text-[10px] uppercase tracking-wider text-nasun-c3 font-semibold">
                    you
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
