import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getTopAccounts } from '../lib/explorer-api';
import type { TopAccount } from '../lib/explorer-api';
import { formatBalance, truncateAddress } from '../lib/format';
import { useDocumentTitle } from '../hooks';

const LIMIT_OPTIONS = [25, 50, 100, 200] as const;

export default function TopAccounts() {
  useDocumentTitle('Top Accounts');
  const [limit, setLimit] = useState<number>(50);

  const { data: accounts, isLoading, error } = useQuery<TopAccount[]>({
    queryKey: ['top-accounts', limit],
    queryFn: () => getTopAccounts(limit),
    staleTime: 5 * 60 * 1000,
  });

  return (
    <>
      <div className="mb-6">
        <Link to="/" className="text-primary hover:underline">
          &larr; Back to Home
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Top Accounts</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Ranked by NSN balance
            {accounts ? ` — ${accounts.length.toLocaleString('en-US')} unique addresses` : ''}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Show:</span>
          {LIMIT_OPTIONS.map((opt) => (
            <button
              key={opt}
              onClick={() => setLimit(opt)}
              className={`px-3 py-1 text-sm rounded-sm border transition-colors ${
                limit === opt
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="rounded-sm border border-destructive/30 bg-destructive/5 p-6 text-center">
          <p className="text-destructive text-sm">
            Failed to load data. The indexer may be syncing.
          </p>
          <p className="text-muted-foreground text-xs mt-2">
            {error instanceof Error ? error.message : 'Unknown error'}
          </p>
        </div>
      ) : isLoading ? (
        <div className="text-muted-foreground py-12 text-center">Loading top accounts...</div>
      ) : accounts && accounts.length > 0 ? (
        <div className="rounded-xl overflow-hidden border border-border/20 bg-card/60 backdrop-blur-md">
          <table className="w-full">
            <thead className="bg-muted/50 border-b border-border/20">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-muted-foreground w-16">
                  Rank
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-muted-foreground">
                  Address
                </th>
                <th className="px-4 py-3 text-right text-sm font-medium uppercase tracking-wider text-muted-foreground">
                  Balance (NSN)
                </th>
                <th className="px-4 py-3 text-right text-sm font-medium uppercase tracking-wider text-muted-foreground hidden sm:table-cell">
                  Coins
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {accounts.map((account, index) => (
                <tr key={account.address} className="hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-3 text-sm text-muted-foreground font-mono">
                    {index + 1}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      to={`/address/${account.address}`}
                      className="font-mono text-sm text-foreground hover:text-primary hover:underline"
                      title={account.address}
                    >
                      <span className="hidden md:inline">{account.address}</span>
                      <span className="md:hidden">{truncateAddress(account.address)}</span>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-sm text-foreground">
                    {formatBalance(account.balance)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-sm text-muted-foreground hidden sm:table-cell">
                    {account.coinCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-muted-foreground py-12 text-center">
          No account data available yet. The indexer may still be syncing.
        </div>
      )}
    </>
  );
}
