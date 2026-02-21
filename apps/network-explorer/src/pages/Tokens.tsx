import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { NBTC_TYPE, NUSDC_TYPE, NETH_TYPE, NSOL_TYPE, TOKENS, TOKENS_V2, NETH_PACKAGE_ID } from '@nasun/devnet-config';
import { getCoinTotalSupply } from '../lib/sui-client';
import { getTokenStats } from '../lib/explorer-api';
import { formatTokenBalance, truncateType } from '../lib/format';

const KNOWN_TOKENS = [
  { coinType: '0x2::sui::SUI', symbol: 'NSN', name: 'Nasun', decimals: 9, packageLink: null },
  { coinType: NBTC_TYPE, symbol: 'NBTC', name: 'Nasun Bitcoin', decimals: 8, packageLink: TOKENS.packageId },
  { coinType: NUSDC_TYPE, symbol: 'NUSDC', name: 'Nasun USD Coin', decimals: 6, packageLink: TOKENS.packageId },
  { coinType: NETH_TYPE, symbol: 'NETH', name: 'Nasun Ethereum', decimals: 8, packageLink: NETH_PACKAGE_ID },
  { coinType: NSOL_TYPE, symbol: 'NSOL', name: 'Nasun Solana', decimals: 8, packageLink: TOKENS_V2.packageId },
];

function brandedType(coinType: string): string {
  return coinType.replace(/0x2::sui::SUI/g, '0x2::nasun::NSN');
}

export default function Tokens() {
  const navigate = useNavigate();

  // API: holder count + circulating supply (DB-backed)
  const { data: stats } = useQuery({
    queryKey: ['token-stats'],
    queryFn: getTokenStats,
    staleTime: 5 * 60 * 1000,
  });

  // RPC: NSN total supply (separate from DB query for resilience)
  const { data: nsnSupply } = useQuery({
    queryKey: ['nsn-total-supply'],
    queryFn: () => getCoinTotalSupply('0x2::sui::SUI'),
    staleTime: 60_000,
  });

  const statsMap = new Map(stats?.map((s) => [s.coinType, s]));

  function getSupplyDisplay(token: typeof KNOWN_TOKENS[number]): string {
    const isNative = token.coinType === '0x2::sui::SUI';

    if (isNative && nsnSupply) {
      return `${formatTokenBalance(nsnSupply, token.coinType, token.decimals)} ${token.symbol} (Total)`;
    }

    const stat = statsMap.get(token.coinType);
    if (stat?.circulatingSupply) {
      return `${formatTokenBalance(stat.circulatingSupply, token.coinType, token.decimals)} ${token.symbol} (Distributed)`;
    }

    return '-';
  }

  function getHolders(coinType: string): string {
    const stat = statsMap.get(coinType);
    return stat ? stat.holders.toLocaleString('en-US') : '-';
  }

  return (
    <>
      <div className="mb-6">
        <Link to="/" className="text-primary hover:underline">
          &larr; Back to Home
        </Link>
      </div>

      <h1 className="text-2xl font-bold mb-6 text-foreground">Tokens</h1>

      <div className="rounded-xl overflow-hidden border border-border/20 bg-card/60 backdrop-blur-md">
        <table className="w-full">
          <thead className="bg-muted/50 border-b border-border/20">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-muted-foreground">
                Symbol
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-muted-foreground">
                Name
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-muted-foreground hidden md:table-cell">
                Type
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-muted-foreground hidden sm:table-cell">
                Holders
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-muted-foreground">
                Supply
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/20">
            {KNOWN_TOKENS.map((token) => {
              const branded = brandedType(token.coinType);
              return (
                <tr
                  key={token.coinType}
                  className={`hover:bg-muted/50 transition-colors ${token.packageLink ? 'cursor-pointer' : ''}`}
                  onClick={token.packageLink ? () => navigate(`/package/${token.packageLink}`) : undefined}
                >
                  <td className="px-4 py-3">
                    <span className="font-mono font-medium text-foreground">{token.symbol}</span>
                  </td>
                  <td className="px-4 py-3 text-foreground text-sm">{token.name}</td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="font-mono text-xs text-muted-foreground" title={branded}>
                      {truncateType(branded)}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-sm text-foreground hidden sm:table-cell">
                    {getHolders(token.coinType)}
                  </td>
                  <td className="px-4 py-3 font-mono text-sm text-foreground">
                    {getSupplyDisplay(token)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
