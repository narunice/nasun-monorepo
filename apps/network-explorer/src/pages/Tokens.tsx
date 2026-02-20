import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getCoinTotalSupply } from '../lib/sui-client';
import { formatTokenBalance } from '../lib/format';

// Nasun Devnet V7 token list — update after devnet reset (sync with devnet-ids.json)
const KNOWN_TOKENS = [
  {
    coinType: '0x2::sui::SUI',
    symbol: 'NSN',
    name: 'Nasun',
    decimals: 9,
  },
  {
    coinType: '0x96adf476d488ffb588d0bfdb5c422355f065386a2e7124e66746fb7078816731::nbtc::NBTC',
    symbol: 'NBTC',
    name: 'Nasun Bitcoin',
    decimals: 8,
  },
  {
    coinType: '0x96adf476d488ffb588d0bfdb5c422355f065386a2e7124e66746fb7078816731::nusdc::NUSDC',
    symbol: 'NUSDC',
    name: 'Nasun USD Coin',
    decimals: 6,
  },
  {
    coinType: '0xe672843fd6e5388ca1248200059c6ef50e82a68689f42f7b9efb3e70dcabdf31::neth::NETH',
    symbol: 'NETH',
    name: 'Nasun Ethereum',
    decimals: 8,
  },
  {
    coinType: '0xcc65166f76b0aed75f8c94527405cec82bb4b416483c7bcdd7725490179601b2::nsol::NSOL',
    symbol: 'NSOL',
    name: 'Nasun Solana',
    decimals: 8,
  },
];

interface TokenRow {
  coinType: string;
  symbol: string;
  name: string;
  decimals: number;
  totalSupply: string | null;
}

function truncateType(coinType: string): string {
  // Nasun branding: native coin type shown as 0x2::nasun::NSN
  const branded = coinType.replace(/0x2::sui::SUI/g, '0x2::nasun::NSN');
  const parts = branded.split('::');
  if (parts.length < 3) return branded;
  const pkgId = parts[0];
  const shortened = pkgId.length > 12 ? `${pkgId.slice(0, 6)}...${pkgId.slice(-4)}` : pkgId;
  return `${shortened}::${parts[1]}::${parts[2]}`;
}

export default function Tokens() {
  const { data: tokens, isLoading } = useQuery<TokenRow[]>({
    queryKey: ['tokens-list'],
    queryFn: async () => {
      const rows = await Promise.all(
        KNOWN_TOKENS.map(async (t) => {
          // Only fetch total supply for native token — faucet-managed tokens
          // have TreasuryCap wrapped inside the faucet contract, so RPC getTotalSupply fails.
          const isNative = t.coinType === '0x2::sui::SUI';
          const supply = isNative ? await getCoinTotalSupply(t.coinType) : null;
          return {
            coinType: t.coinType,
            // Always use hardcoded values — RPC returns "SUI" for the native coin
            symbol: t.symbol,
            name: t.name,
            decimals: t.decimals,
            totalSupply: supply,
          };
        })
      );
      return rows;
    },
    staleTime: 60_000,
  });

  return (
    <>
      <div className="mb-6">
        <Link to="/" className="text-primary hover:underline">
          &larr; Back to Home
        </Link>
      </div>

      <h1 className="text-2xl font-bold mb-6 text-foreground">Tokens</h1>

      {isLoading ? (
        <div className="text-muted-foreground">Loading...</div>
      ) : (
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
                <th className="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-muted-foreground">
                  Decimals
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-muted-foreground">
                  Total Supply
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {(tokens ?? KNOWN_TOKENS.map((t) => ({ ...t, totalSupply: null }))).map((token) => (
                <tr key={token.coinType} className="hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-3">
                    <span className="font-mono font-medium text-foreground">{token.symbol}</span>
                  </td>
                  <td className="px-4 py-3 text-foreground text-sm">{token.name}</td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span
                      className="font-mono text-xs text-muted-foreground"
                      title={token.coinType.replace(/0x2::sui::SUI/g, '0x2::nasun::NSN')}
                    >
                      {truncateType(token.coinType)}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-sm text-foreground">{token.decimals}</td>
                  <td className="px-4 py-3 font-mono text-sm text-foreground">
                    {token.totalSupply
                      ? `${formatTokenBalance(token.totalSupply, token.coinType, token.decimals)} ${token.symbol}`
                      : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
