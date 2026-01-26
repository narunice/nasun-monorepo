import { Link } from 'react-router-dom';
import { SectionBox } from '../ui/SectionBox';
import { truncateDigest, formatTimestamp } from '../../lib/format';
import type { SuiTransactionBlockResponse } from '@mysten/sui/client';

interface AddressTransactionHistoryProps {
  transactions: SuiTransactionBlockResponse[] | undefined;
  isLoading: boolean;
}

export default function AddressTransactionHistory({
  transactions,
  isLoading,
}: AddressTransactionHistoryProps) {
  return (
    <SectionBox title="Transaction History" color="c6">
      {isLoading ? (
        <div className="text-muted-foreground text-center py-8">Loading transactions...</div>
      ) : transactions && transactions.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-border/20 bg-card/60 backdrop-blur-md">
          <table className="w-full">
            <thead className="bg-muted/50 border-b border-border/20">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-muted-foreground">
                  Digest
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-muted-foreground">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-muted-foreground">
                  Time
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-muted-foreground">
                  Checkpoint
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {transactions.map((tx) => (
                <tr key={tx.digest} className="hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-3">
                    <Link
                      to={`/tx/${tx.digest}`}
                      className="font-mono text-sm text-primary hover:underline"
                    >
                      {truncateDigest(tx.digest)}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-1 text-xs rounded ${
                        tx.effects?.status?.status === 'success'
                          ? 'bg-green-500/20 text-green-600 dark:text-green-400'
                          : 'bg-destructive/20 text-destructive'
                      }`}
                    >
                      {tx.effects?.status?.status || 'unknown'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-sm">
                    {formatTimestamp(tx.timestampMs)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground font-mono">
                    {tx.checkpoint || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-muted-foreground text-center py-8">
          No transactions found for this address
        </div>
      )}
    </SectionBox>
  );
}
