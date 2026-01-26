import { Card } from '../ui/Card';
import { SectionBox } from '../ui/SectionBox';
import { formatSoe } from '../../lib/format';

interface TransactionGasProps {
  budget: string | number | undefined;
  price: string | number | undefined;
  gasUsed: {
    computationCost: string;
    storageCost: string;
    storageRebate: string;
  } | undefined;
}

export default function TransactionGas({ budget, price, gasUsed }: TransactionGasProps) {
  const totalGasUsed = gasUsed
    ? formatSoe(
        BigInt(gasUsed.computationCost) +
          BigInt(gasUsed.storageCost) -
          BigInt(gasUsed.storageRebate)
      )
    : '-';

  return (
    <SectionBox title="Gas" color="c5">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card variant="default" className="p-4">
          <div className="text-muted-foreground text-sm uppercase tracking-wider">Gas Budget</div>
          <div className="font-mono text-foreground">{formatSoe(budget)}</div>
        </Card>
        <Card variant="default" className="p-4">
          <div className="text-muted-foreground text-sm uppercase tracking-wider">Gas Price</div>
          <div className="font-mono text-foreground">{formatSoe(price)}</div>
        </Card>
        <Card variant="default" className="p-4">
          <div className="text-muted-foreground text-sm uppercase tracking-wider">Gas Used</div>
          <div className="font-mono text-foreground">{totalGasUsed}</div>
        </Card>
      </div>
    </SectionBox>
  );
}
