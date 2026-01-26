import { Card } from '../ui/Card';
import { SectionBox } from '../ui/SectionBox';
import { CoinSymbol } from '../CoinSymbol';
import { formatTokenBalance } from '../../lib/format';

interface TokenBalance {
  coinType: string;
  totalBalance: string;
  coinObjectCount: number;
}

interface AddressTokenBalancesProps {
  balances: TokenBalance[];
}

export default function AddressTokenBalances({ balances }: AddressTokenBalancesProps) {
  return (
    <SectionBox title="Token Balances" color="c4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {balances && balances.length > 0 ? (
          balances.map((bal) => (
            <Card key={bal.coinType} variant="default" className="p-4">
              <div className="text-muted-foreground text-sm uppercase tracking-wider mb-1">
                <CoinSymbol type={bal.coinType} />
              </div>
              <div className="text-xl font-bold text-primary">
                {formatTokenBalance(bal.totalBalance, bal.coinType)}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {bal.coinObjectCount} coin object{bal.coinObjectCount !== 1 ? 's' : ''}
              </div>
            </Card>
          ))
        ) : (
          <Card variant="default" className="p-4">
            <div className="text-muted-foreground">No tokens found</div>
          </Card>
        )}
      </div>
    </SectionBox>
  );
}
